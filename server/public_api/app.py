# app.py
from __future__ import annotations
import os, json, duckdb
from typing import List, Tuple

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# ---------- env / settings ----------
load_dotenv()  # reads .env from the current folder

def _resolve_db_path() -> str:
    raw = os.getenv("DUCKDB_PATH", "warehouse.duckdb")
    if not os.path.isabs(raw):
        raw = os.path.abspath(os.path.join(os.path.dirname(__file__), raw))
    print("Resolved DUCKDB_PATH:", raw, "exists:", os.path.exists(raw))
    return raw

DB_PATH = _resolve_db_path()
READ_ONLY = os.getenv("READ_ONLY", "true").lower() in ("1", "true", "yes")
ALLOW_ORIGINS = [o.strip() for o in os.getenv("CORS_ALLOW_ORIGINS", "http://localhost:5173").split(",") if o.strip()]

app = FastAPI(title=f"EMSV API ({'RO' if READ_ONLY else 'RW'})")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- single shared DuckDB connection ----------
_con: duckdb.DuckDBPyConnection | None = None

@app.on_event("startup")
def _startup():
    global _con
    _con = duckdb.connect(DB_PATH, read_only=READ_ONLY)
    # Install/load spatial once; no-ops if already installed
    _con.execute("INSTALL spatial;")
    _con.execute("LOAD spatial;")
    # Optional (DuckDB >= 0.10) – ignore if older
    try:
        _con.execute("SET lock_timeout='5s';")
    except duckdb.Error:
        pass

@app.on_event("shutdown")
def _shutdown():
    global _con
    if _con:
        _con.close()
        _con = None

def q(sql: str, params: list | tuple = ()):
    """Query helper against the shared connection with friendly errors."""
    try:
        assert _con is not None
        return _con.execute(sql, params).fetchall()
    except duckdb.Error as e:
        raise HTTPException(500, f"DuckDB error: {e}") from e

# ---------- helpers ----------
def parse_bbox(bbox: str | None) -> tuple[str, list]:
    if not bbox:
        return "", []
    parts = bbox.split(",")
    if len(parts) != 4:
        raise HTTPException(400, "bbox debe ser 'minx,miny,maxx,maxy'")
    minx, miny, maxx, maxy = map(float, parts)
    return "WHERE ST_Intersects(geom, ST_MakeEnvelope(?, ?, ?, ?))", [minx, miny, maxx, maxy]

def fc(features: list[dict]) -> dict:
    return {"type": "FeatureCollection", "features": features}


# ---------- Buffers ----------
def _select_buffers(where_sql: str, params: list) -> List[Tuple]:
    sql = f"""
        WITH f AS (
          SELECT id, user_id, buffer_m, geom
          FROM point_buffers
          {where_sql}
        )
        SELECT id, user_id, buffer_m, ST_AsGeoJSON(geom) AS geom_json
        FROM f;
    """
    return q(sql, params)

@app.get("/buffers")
def get_buffers(bbox: str | None = None, limit: int = 1000, offset: int = 0):
    where_sql = ""
    params: list = []
    if bbox:
        w, p = parse_bbox(bbox)
        where_sql = f"{w} LIMIT ? OFFSET ?"
        params = p + [limit, offset]
    else:
        where_sql = "LIMIT ? OFFSET ?"
        params = [limit, offset]

    rows = _select_buffers(where_sql, params)
    features = [{
        "type": "Feature",
        "geometry": json.loads(gjson) if isinstance(gjson, str) else gjson,
        "properties": {"id": rid, "user_id": ruser, "buffer_m": float(rbuf) if rbuf is not None else None}
    } for rid, ruser, rbuf, gjson in rows]
    return fc(features)

# ---------- Points ----------
class SavePointReq(BaseModel):
    lon: float
    lat: float
    buffer_m: float = 100.0
    user_id: str | None = None

@app.post("/points")
def save_point(req: SavePointReq):
    if READ_ONLY:
        raise HTTPException(403, "Esta API está en modo read-only")
    # Create a short transaction for safety
    try:
        assert _con is not None
        _con.execute("BEGIN")
        new_id = _con.execute("SELECT COALESCE(MAX(id),0)+1 FROM points").fetchone()[0]
        _con.execute(
            """
            INSERT INTO points (id, user_id, geom, buffer_m, props)
            VALUES (?, ?, ST_Point(?, ?), ?, {'source':'form'}::JSON)
            """,
            [new_id, req.user_id, req.lon, req.lat, req.buffer_m],
        )
        _con.execute("COMMIT")
    except Exception:
        _con.execute("ROLLBACK")
        raise
    return {"ok": True, "id": new_id}

@app.get("/points/count")
def points_count(bbox: str | None = None):
    where, params = parse_bbox(bbox)
    cnt = q(f"SELECT COUNT(*) FROM big_points {where};", params)[0][0]
    return {"count": int(cnt)}

@app.get("/points/features")
def points_features(
    bbox: str | None = Query(None, description="minx,miny,maxx,maxy (WGS84)"),
    limit: int = 2000,
    offset: int = 0,
):
    where, params = parse_bbox(bbox)
    rows = q(f"""
        WITH f AS (
          SELECT geom, * EXCLUDE (geom)
          FROM big_points
          {where}
          LIMIT ? OFFSET ?
        )
        SELECT ST_AsGeoJSON(geom) AS gjson, to_json(f) AS props
        FROM f;
    """, params + [limit, offset])

    features = [{
        "type": "Feature",
        "geometry": json.loads(gjson),
        "properties": json.loads(props) if isinstance(props, str) else (props or {})
    } for gjson, props in rows]
    return fc(features)

# ---------- Shadows ----------
@app.get("/shadows/features")
def shadows_features(
    bbox: str | None = Query(None, description="minx,miny,maxx,maxy (WGS84)"),
    limit: int = 5000,
    offset: int = 0,
):
    where, params = parse_bbox(bbox)
    rows = q(f"""
        WITH f AS (
          SELECT geom, shadow_count
          FROM shadows
          {where}
          LIMIT ? OFFSET ?
        )
        SELECT ST_AsGeoJSON(geom) AS gjson, shadow_count FROM f;
    """, params + [limit, offset])

    features = [{
        "type": "Feature",
        "geometry": json.loads(gjson),
        "properties": {"shadow_count": float(sc) if sc is not None else None}
    } for gjson, sc in rows]
    return fc(features)

class ZonalReq(BaseModel):
    geometry: dict  # GeoJSON Polygon/MultiPolygon

@app.post("/shadows/zonal")
def shadows_zonal(req: ZonalReq):
    geojson = json.dumps(req.geometry)
    n, avg, mn, mx = q("""
        WITH zone AS (SELECT ST_GeomFromGeoJSON(?::VARCHAR) AS g),
        hits AS (
          SELECT s.shadow_count
          FROM shadows s, zone z
          WHERE ST_Intersects(s.geom, z.g)
        )
        SELECT COUNT(*), AVG(shadow_count), MIN(shadow_count), MAX(shadow_count) FROM hits;
    """, [geojson])[0]

    return {
        "count": int(n or 0),
        "avg": float(avg) if avg is not None else None,
        "min": float(mn) if mn is not None else None,
        "max": float(mx) if mx is not None else None,
    }

# ---------- Buildings ----------
@app.get("/buildings/features")
def buildings_features(
    bbox: str | None = Query(None, description="minx,miny,maxx,maxy (WGS84)"),
    limit: int = 50000,
    offset: int = 0,
):
    where, params = parse_bbox(bbox)
    rows = q(f"""
        WITH f AS (
          SELECT geom, * EXCLUDE (geom)
          FROM buildings
          {where}
          LIMIT ? OFFSET ?
        )
        SELECT ST_AsGeoJSON(geom) AS gjson, to_json(f) AS props FROM f;
    """, params + [limit, offset])

    features = [{
        "type": "Feature",
        "geometry": json.loads(gjson),
        "properties": json.loads(props) if isinstance(props, str) else (props or {})
    } for gjson, props in rows]
    return fc(features)

@app.get("/buildings/by_ref")
def building_by_reference(ref: str = Query(..., description="Referencia catastral exacta")):
    ref_norm = ref.strip()
    rows = q("""
        WITH f AS (
          SELECT geom, * EXCLUDE (geom)
          FROM buildings
          WHERE UPPER(reference) = UPPER(?)
          LIMIT 1
        )
        SELECT ST_AsGeoJSON(geom) AS gjson, to_json(f) AS props FROM f;
    """, [ref_norm])

    if not rows:
        raise HTTPException(404, "Referencia no encontrada")

    gjson, props = rows[0]
    return {
        "type": "Feature",
        "geometry": json.loads(gjson),
        "properties": json.loads(props) if isinstance(props, str) else (props or {})
    }

# ---------- Address lookup ----------
@app.get("/address/lookup")
def lookup_address(street: str, number: str, include_feature: bool = False):
    import unicodedata

    def norm(s: str) -> str:
        s = "" if s is None else s
        s = unicodedata.normalize("NFD", s)
        s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
        s = s.upper().strip()
        for p in ["CALLE ", "CL ", "C/ ", "AVENIDA ", "AV ", "AV.", "PASEO ", "PS ", "PLAZA ", "PZA "]:
            if s.startswith(p):
                s = s[len(p):]
        return " ".join(s.split())

    street_norm = norm(street)
    number_norm = norm(number)

    row = q("""
        SELECT reference
        FROM address_index
        WHERE street_norm = ? AND number_norm = ?
        LIMIT 1;
    """, [street_norm, number_norm])

    if not row:
        raise HTTPException(404, "Dirección no encontrada")

    reference = row[0][0]
    if not include_feature:
        return {"reference": reference}

    feat = q("""
        SELECT ST_AsGeoJSON(geom) as gjson, reference
        FROM buildings
        WHERE reference = ?
        LIMIT 1;
    """, [reference])

    feature = None
    if feat:
        gjson_str, ref_val = feat[0]
        feature = {"type": "Feature", "geometry": json.loads(gjson_str), "properties": {"reference": ref_val}}
    return {"reference": reference, "feature": feature}


# ---------- CELS points (centroids) ----------
@app.get("/cels/features")
def cels_features(
    bbox: str | None = Query(None, description="minx,miny,maxx,maxy (WGS84)"),
    limit: int = 20000,
    offset: int = 0,
):
    where, params = parse_bbox(bbox)
    rows = q(f"""
        WITH j AS (
          SELECT 
            ST_PointOnSurface(b.geom) AS pt,  -- point we’ll use for geometry & bbox
            c.id,
            c.nombre,
            c.street_norm,
            c.number_norm,
            c.reference,
            c.auto_CEL
          FROM buildings b
          JOIN autoconsumos_CELS c
            ON LEFT(UPPER(b.reference), 14) = LEFT(UPPER(c.reference), 14)
          {where.replace("geom", "pt")}      -- make the bbox filter use the POINT
          LIMIT ? OFFSET ?
        )
        SELECT 
          ST_AsGeoJSON(pt) AS gjson,
          to_json(struct_pack(
            id := id,
            nombre := nombre,
            street_norm := street_norm,
            number_norm := number_norm,
            reference := reference,
            auto_CEL := auto_CEL
          )) AS props
        FROM j;
    """, params + [limit, offset])

    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": json.loads(gjson),
                "properties": json.loads(props) if isinstance(props, str) else (props or {}),
            }
            for gjson, props in rows
        ],
    }





# ---------- CELS membership check ----------
class CelsWithinReq(BaseModel):
    geometry: dict  # GeoJSON geometry (Point, Polygon, etc.)

@app.post("/cels/within")
def cels_within_buffer(
    req: CelsWithinReq,
    radius_m: float = Query(500, description="Radio del buffer CELS en metros")
):
    """
    Devuelve todos los CELS cuyos buffers contienen (intersectan) la geometría dada.
    Versión simplificada usando distancia en grados (aproximada).
    """
    geojson_str = json.dumps(req.geometry)
    
    # Convertir metros a grados aproximadamente (1 grado ≈ 111km en latitud)
    # Para Madrid (40°N), 1 grado longitud ≈ 85km
    radius_deg = radius_m / 85000.0  # aproximación para longitud en Madrid
    
    try:
        rows = q("""
            WITH input_geom AS (
              SELECT ST_GeomFromGeoJSON(?::VARCHAR) AS geom
            ),
            cels_points AS (
              SELECT 
                c.id,
                c.nombre,
                c.street_norm,
                c.number_norm,
                c.reference AS cels_ref,
                c.auto_CEL,
                ST_Centroid(b.geom) AS point_geom
              FROM autoconsumos_CELS c
              JOIN buildings b 
                ON LEFT(UPPER(b.reference), 14) = LEFT(UPPER(c.reference), 14)
            ),
            input_point AS (
              SELECT ST_Centroid(geom) AS center FROM input_geom
            )
            SELECT 
              cp.id,
              cp.nombre,
              cp.street_norm,
              cp.number_norm,
              cp.cels_ref,
              cp.auto_CEL,
              ST_Distance(cp.point_geom, ip.center) AS distance_deg
            FROM cels_points cp, input_point ip
            WHERE ST_Distance(cp.point_geom, ip.center) <= ?
            ORDER BY distance_deg;
        """, [geojson_str, radius_deg])
        
        cels = []
        for row in rows:
            # Convertir distancia de grados a metros (aproximado)
            distance_deg = float(row[6]) if row[6] is not None else None
            distance_m = distance_deg * 85000.0 if distance_deg else None
            
            cels.append({
                "id": row[0],
                "nombre": row[1] if row[1] else "(sin nombre)",
                "street_norm": row[2],
                "number_norm": row[3],
                "reference": row[4],
                "auto_CEL": int(row[5]) if row[5] is not None else None,
                "distance_m": distance_m,
            })
        
        return {
            "count": len(cels),
            "cels": cels,
            "radius_m": radius_m
        }
    except Exception as e:
        print(f"Error in /cels/within: {e}")
        raise HTTPException(500, f"Error: {str(e)}")






# Agrega este endpoint temporal para debug en app.py
@app.get("/debug/cels/count")
def debug_cels_count():
    """Endpoint temporal para verificar datos CELS"""
    try:
        # Contar registros en autoconsumos_CELS
        count_cels = q("SELECT COUNT(*) FROM autoconsumos_CELS")[0][0]
        
        # Contar registros en buildings que coinciden
        count_matches = q("""
            SELECT COUNT(*)
            FROM buildings b
            JOIN autoconsumos_CELS c
              ON LEFT(UPPER(b.reference), 14) = LEFT(UPPER(c.reference), 14)
        """)[0][0]
        
        # Muestra ejemplo
        sample = q("""
            SELECT c.id, c.nombre, c.reference, c.auto_CEL
            FROM autoconsumos_CELS c
            LIMIT 5
        """)
        
        return {
            "cels_count": int(count_cels),
            "buildings_with_cels": int(count_matches),
            "sample": [{"id": r[0], "nombre": r[1], "reference": r[2], "auto_CEL": r[3]} for r in sample]
        }
    except Exception as e:
        return {"error": str(e)}
    

@app.get("/cadastre/feature")
def cadastre_by_refcat(
    refcat: str = Query(..., description="Referencia catastral"),
    include_feature: bool = Query(False, description="Incluir geometría GeoJSON")
):
    """Busca un edificio por referencia catastral exacta"""
    ref_norm = refcat.strip()
    
    if not include_feature:
        # Solo devolver si existe
        exists = q("SELECT 1 FROM buildings WHERE UPPER(reference) = UPPER(?) LIMIT 1", [ref_norm])
        if not exists:
            raise HTTPException(404, "Referencia catastral no encontrada")
        return {"reference": ref_norm}
    
    # Con geometría
    rows = q("""
        WITH f AS (
          SELECT geom, * EXCLUDE (geom)
          FROM buildings
          WHERE UPPER(reference) = UPPER(?)
          LIMIT 1
        )
        SELECT ST_AsGeoJSON(geom) AS gjson, to_json(f) AS props FROM f;
    """, [ref_norm])

    if not rows:
        raise HTTPException(404, "Referencia catastral no encontrada")

    gjson, props = rows[0]
    return {
        "reference": ref_norm,
        "feature": {
            "type": "Feature",
            "geometry": json.loads(gjson),
            "properties": json.loads(props) if isinstance(props, str) else (props or {})
        }
    }