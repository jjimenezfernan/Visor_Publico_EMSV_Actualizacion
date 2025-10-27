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
