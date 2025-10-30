# app.py — single FastAPI app, per-request DuckDB connections
from __future__ import annotations
import os, json, duckdb, unicodedata
from typing import List, Tuple

from fastapi import FastAPI, HTTPException, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

# ============================================================
# SETTINGS
# ============================================================

load_dotenv()

def _resolve_db_path() -> str:
    raw = os.getenv("DUCKDB_PATH", "warehouse.duckdb")
    if not os.path.isabs(raw):
        raw = os.path.abspath(os.path.join(os.path.dirname(__file__), raw))
    print("Resolved DUCKDB_PATH:", raw, "exists:", os.path.exists(raw))
    return raw

DB_PATH = _resolve_db_path()
READ_ONLY = os.getenv("READ_ONLY", "true").lower() in ("1", "true", "yes")

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

# ============================================================
# DATABASE CONNECTION HANDLING (per request)
# ============================================================

def get_conn():
    """Open a new DuckDB connection per request (safe for concurrency/workers)."""
    con = duckdb.connect(DB_PATH, read_only=READ_ONLY)
    # Spatial extension should already be installed once in your DB; LOAD is cheap.
    con.execute("LOAD spatial;")
    # Tweak concurrency a bit; ignore if not supported
    try:
        con.execute("PRAGMA threads=4;")
    except duckdb.Error:
        pass
    try:
        con.execute("SET lock_timeout='5s';")
    except duckdb.Error:
        pass
    try:
        yield con
    finally:
        con.close()

def q(con: duckdb.DuckDBPyConnection, sql: str, params: list | tuple = ()):
    """Query helper that returns [] on empty and wraps errors."""
    try:
        return con.execute(sql, params).fetchall() or []
    except duckdb.Error as e:
        raise HTTPException(500, f"DuckDB error: {e}") from e

# ============================================================
# HELPERS
# ============================================================

def parse_bbox(bbox: str | None) -> tuple[str, list]:
    if not bbox:
        return "", []
    parts = bbox.split(",")
    if len(parts) != 4:
        raise HTTPException(400, "bbox debe ser 'minx,miny,maxx,maxy'")
    minx, miny, maxx, maxy = map(float, parts)
    return "WHERE ST_Intersects(geom, ST_MakeEnvelope(?, ?, ?, ?))", [minx, miny, maxx, maxy]

def parse_bbox_for_srid(bbox: str | None, target_srid: int) -> tuple[str, list]:
    if not bbox:
        return "", []
    parts = bbox.split(",")
    if len(parts) != 4:
        raise HTTPException(400, "bbox debe ser 'minx,miny,maxx,maxy'")
    minx, miny, maxx, maxy = map(float, parts)
    where = (
        "WHERE ST_Intersects("
        "  geom,"
        "  ST_Transform("
        "    ST_MakeEnvelope(?, ?, ?, ?),"
        "    'EPSG:4326',"
        f"    'EPSG:{target_srid}',"
        "    TRUE"
        "  )"
        ")"
    )
    return where, [minx, miny, maxx, maxy]

def fc(features: list[dict]) -> dict:
    return {"type": "FeatureCollection", "features": features}

# ============================================================
# MODELS
# ============================================================

class ZonalReq(BaseModel):
    geometry: dict  # GeoJSON Polygon/MultiPolygon/Point/…

class SavePointReq(BaseModel):
    lon: float
    lat: float
    buffer_m: float = 100.0
    user_id: str | None = None

class CelsWithinReq(BaseModel):
    geometry: dict  # GeoJSON geometry

# ============================================================
# BUFFERS
# ============================================================

def _select_buffers(con: duckdb.DuckDBPyConnection, where_sql: str, params: list) -> List[Tuple]:
    sql = f"""
        WITH f AS (
          SELECT id, user_id, buffer_m, geom
          FROM point_buffers
          {where_sql}
        )
        SELECT id, user_id, buffer_m, ST_AsGeoJSON(geom) AS geom_json
        FROM f;
    """
    return q(con, sql, params)

@app.get("/buffers")
def get_buffers(
    bbox: str | None = None,
    limit: int = 1000,
    offset: int = 0,
    con: duckdb.DuckDBPyConnection = Depends(get_conn),
):
    where_sql = ""
    params: list = []
    if bbox:
        w, p = parse_bbox(bbox)
        where_sql = f"{w} LIMIT ? OFFSET ?"
        params = p + [limit, offset]
    else:
        where_sql = "LIMIT ? OFFSET ?"
        params = [limit, offset]

    rows = _select_buffers(con, where_sql, params)
    features = [{
        "type": "Feature",
        "geometry": json.loads(gjson) if isinstance(gjson, str) else gjson,
        "properties": {
            "id": rid,
            "user_id": ruser,
            "buffer_m": float(rbuf) if rbuf is not None else None
        }
    } for rid, ruser, rbuf, gjson in rows]
    return fc(features)

# ============================================================
# POINTS
# ============================================================

@app.post("/points")
def save_point(
    req: SavePointReq,
    con: duckdb.DuckDBPyConnection = Depends(get_conn),
):
    if READ_ONLY:
        raise HTTPException(403, "Esta API está en modo read-only")
    try:
        con.execute("BEGIN")
        new_id = con.execute("SELECT COALESCE(MAX(id),0)+1 FROM points").fetchone()[0]
        con.execute(
            """
            INSERT INTO points (id, user_id, geom, buffer_m, props)
            VALUES (?, ?, ST_Point(?, ?), ?, {'source':'form'}::JSON)
            """,
            [new_id, req.user_id, req.lon, req.lat, req.buffer_m],
        )
        con.execute("COMMIT")
    except Exception as e:
        con.execute("ROLLBACK")
        raise HTTPException(500, f"Insert failed: {e}")
    return {"ok": True, "id": new_id}

@app.get("/points/count")
def points_count(
    bbox: str | None = None,
    con: duckdb.DuckDBPyConnection = Depends(get_conn),
):
    where, params = parse_bbox(bbox)
    cnt = q(con, f"SELECT COUNT(*) FROM big_points {where};", params)[0][0]
    return {"count": int(cnt)}

@app.get("/points/features")
def points_features(
    bbox: str | None = Query(None),
    limit: int = 2000,
    offset: int = 0,
    con: duckdb.DuckDBPyConnection = Depends(get_conn),
):
    where, params = parse_bbox(bbox)
    rows = q(con, f"""
        WITH f AS (
          SELECT geom, * EXCLUDE (geom)
          FROM big_points
          {where}
          LIMIT ? OFFSET ?
        )
        SELECT ST_AsGeoJSON(geom), to_json(f) FROM f;
    """, params + [limit, offset])

    feats = [
        {"type": "Feature", "geometry": json.loads(g), "properties": json.loads(p) if isinstance(p, str) else {}}
        for g, p in rows
    ]
    return fc(feats)

# ============================================================
# SHADOWS
# ============================================================

@app.get("/shadows/features")
def shadows_features(
    bbox: str | None = Query(None),
    limit: int = 5000,
    offset: int = 0,
    con: duckdb.DuckDBPyConnection = Depends(get_conn),
):
    where, params = parse_bbox(bbox)
    rows = q(con, f"""
        WITH f AS (
          SELECT geom, shadow_count
          FROM shadows
          {where}
          LIMIT ? OFFSET ?
        )
        SELECT ST_AsGeoJSON(geom), shadow_count FROM f;
    """, params + [limit, offset])

    feats = [
        {"type": "Feature", "geometry": json.loads(g), "properties": {"shadow_count": float(s) if s is not None else None}}
        for g, s in rows
    ]
    return fc(feats)

@app.post("/shadows/zonal")
def shadows_zonal(req: ZonalReq, con: duckdb.DuckDBPyConnection = Depends(get_conn)):
    geojson = json.dumps(req.geometry)
    rows = q(con, """
        WITH zone_raw AS (SELECT ST_GeomFromGeoJSON(?::VARCHAR) AS g),
        zone AS (
          SELECT CASE WHEN ST_IsValid(g) THEN g ELSE ST_Buffer(g, 0) END AS g FROM zone_raw
        ),
        hits AS (
          SELECT s.shadow_count FROM shadows s, zone z WHERE ST_Intersects(s.geom, z.g)
        )
        SELECT COALESCE(COUNT(*),0), AVG(shadow_count), MIN(shadow_count), MAX(shadow_count) FROM hits;
    """, [geojson])
    n, avg, mn, mx = rows[0] if rows else (0, None, None, None)
    return {
        "count": int(n or 0),
        "avg": float(avg) if avg is not None else None,
        "min": float(mn) if mn is not None else None,
        "max": float(mx) if mx is not None else None,
    }

# ============================================================
# IRRADIANCE
# ============================================================

@app.get("/irradiance/features")
def irradiance_features(
    bbox: str | None = Query(None),
    con: duckdb.DuckDBPyConnection = Depends(get_conn),
):
    where, params = parse_bbox_for_srid(bbox, 25830)
    rows = q(con, f"""
        SELECT ST_AsGeoJSON(ST_Transform(geom, 'EPSG:25830','EPSG:4326', TRUE)), value
        FROM irr_points
        {where};
    """, params)
    feats = [
        {"type": "Feature", "geometry": json.loads(g), "properties": {"value": float(v) if v is not None else None}}
        for g, v in rows
    ]
    return fc(feats)

@app.post("/irradiance/zonal")
def irradiance_zonal(req: ZonalReq, con: duckdb.DuckDBPyConnection = Depends(get_conn)):
    geojson = json.dumps(req.geometry)
    rows = q(con, """
        WITH zone AS (
          SELECT ST_Transform(
            ST_GeomFromGeoJSON(?::VARCHAR),
            'EPSG:4326','EPSG:25830', TRUE
          ) AS g
        ),
        zone_ok AS (
          SELECT CASE WHEN ST_IsValid(g) THEN g ELSE ST_Buffer(g,0) END AS g FROM zone
        ),
        hits AS (
          SELECT p.value FROM irr_points p, zone_ok z WHERE ST_Intersects(p.geom, z.g)
        )
        SELECT COALESCE(COUNT(*),0), AVG(value), MIN(value), MAX(value) FROM hits;
    """, [geojson])
    n, avg, mn, mx = rows[0] if rows else (0, None, None, None)
    return {
        "count": int(n or 0),
        "avg": float(avg) if avg is not None else None,
        "min": float(mn) if mn is not None else None,
        "max": float(mx) if mx is not None else None,
    }

# ============================================================
# BUILDINGS + METRICS
# ============================================================

@app.get("/buildings/features")
def buildings_features(
    bbox: str | None = Query(None),
    limit: int = 50000,
    offset: int = 0,
    con: duckdb.DuckDBPyConnection = Depends(get_conn),
):
    where, params = parse_bbox(bbox)
    rows = q(con, f"""
        WITH f AS (
          SELECT geom, * EXCLUDE (geom)
          FROM buildings
          {where}
          LIMIT ? OFFSET ?
        )
        SELECT ST_AsGeoJSON(geom), to_json(f) FROM f;
    """, params + [limit, offset])
    feats = [
        {"type": "Feature", "geometry": json.loads(g), "properties": json.loads(p) if isinstance(p, str) else {}}
        for g, p in rows
    ]
    return fc(feats)

@app.get("/buildings/irradiance")
def buildings_irradiance(
    bbox: str | None = Query(None),
    limit: int = 50000,
    offset: int = 0,
    con: duckdb.DuckDBPyConnection = Depends(get_conn),
):
    where, params = parse_bbox(bbox)
    rows = q(con, f"""
        WITH f AS (
          SELECT b.geom, b.reference, m.irr_mean_kWhm2_y, m.irr_average
          FROM buildings b
          LEFT JOIN edificios_metrics m ON UPPER(b.reference)=UPPER(m.reference)
          {where}
          LIMIT ? OFFSET ?
        )
        SELECT ST_AsGeoJSON(geom), reference, irr_mean_kWhm2_y, irr_average FROM f;
    """, params + [limit, offset])
    feats = []
    for g, ref, irr_mean, irr_avg in rows:
        v = irr_mean if irr_mean is not None else irr_avg
        feats.append({
            "type": "Feature",
            "geometry": json.loads(g),
            "properties": {"reference": ref, "irr_building": float(v) if v is not None else None},
        })
    return fc(feats)

@app.get("/buildings/metrics")
def buildings_metrics(reference: str, con: duckdb.DuckDBPyConnection = Depends(get_conn)):
    ref = reference.strip()
    rows = q(con, """
        SELECT reference,
               irr_average, area_m2, superficie_util_m2, pot_kWp,
               energy_total_kWh, factor_capacidad_pct, irr_mean_kWhm2_y
        FROM edificios_metrics WHERE UPPER(reference)=UPPER(?) LIMIT 1;
    """, [ref])
    if not rows:
        raise HTTPException(404, "No metrics for this reference")
    r = rows[0]
    return {
        "reference": r[0],
        "metrics": {
            "irr_average": float(r[1]) if r[1] is not None else None,
            "area_m2": float(r[2]) if r[2] is not None else None,
            "superficie_util_m2": float(r[3]) if r[3] is not None else None,
            "pot_kWp": float(r[4]) if r[4] is not None else None,
            "energy_total_kWh": float(r[5]) if r[5] is not None else None,
            "factor_capacidad_pct": float(r[6]) if r[6] is not None else None,
            "irr_mean_kWhm2_y": float(r[7]) if r[7] is not None else None,
        },
    }

@app.get("/buildings/by_ref")
def building_by_reference(
    ref: str = Query(..., description="Referencia catastral exacta"),
    con: duckdb.DuckDBPyConnection = Depends(get_conn),
):
    ref_norm = ref.strip()
    rows = q(con, """
        WITH f AS (
          SELECT geom, * EXCLUDE (geom)
          FROM buildings
          WHERE UPPER(reference) = UPPER(?)
          LIMIT 1
        )
        SELECT ST_AsGeoJSON(geom), to_json(f) FROM f;
    """, [ref_norm])

    if not rows:
        raise HTTPException(404, "Referencia no encontrada")

    gjson, props = rows[0]
    return {
        "type": "Feature",
        "geometry": json.loads(gjson),
        "properties": json.loads(props) if isinstance(props, str) else (props or {})
    }

# ============================================================
# ADDRESS LOOKUP
# ============================================================

@app.get("/address/lookup")
def lookup_address(
    street: str,
    number: str,
    include_feature: bool = False,
    con: duckdb.DuckDBPyConnection = Depends(get_conn),
):
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

    row = q(con, """
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

    feat = q(con, """
        SELECT ST_AsGeoJSON(geom), reference
        FROM buildings
        WHERE reference = ?
        LIMIT 1;
    """, [reference])

    feature = None
    if feat:
        gjson_str, ref_val = feat[0]
        feature = {"type": "Feature", "geometry": json.loads(gjson_str), "properties": {"reference": ref_val}}
    return {"reference": reference, "feature": feature}

# ============================================================
# CELS
# ============================================================

@app.get("/cels/features")
def cels_features(
    bbox: str | None = Query(None, description="minx,miny,maxx,maxy (WGS84)"),
    limit: int = 20000,
    offset: int = 0,
    con: duckdb.DuckDBPyConnection = Depends(get_conn),
):
    where, params = parse_bbox(bbox)
    rows = q(con, f"""
        WITH j AS (
          SELECT 
            ST_PointOnSurface(b.geom) AS pt,
            c.id, c.nombre, c.street_norm, c.number_norm, c.reference, c.auto_CEL
          FROM buildings b
          JOIN autoconsumos_CELS c
            ON LEFT(UPPER(b.reference), 14) = LEFT(UPPER(c.reference), 14)
          {where.replace("geom", "pt")}
          LIMIT ? OFFSET ?
        )
        SELECT ST_AsGeoJSON(pt), to_json(struct_pack(
            id := id, nombre := nombre, street_norm := street_norm,
            number_norm := number_norm, reference := reference, auto_CEL := auto_CEL
        ))
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

@app.post("/cels/within")
def cels_within_buffer(
    req: CelsWithinReq,
    radius_m: float = Query(500, description="Radio del buffer CELS en metros"),
    con: duckdb.DuckDBPyConnection = Depends(get_conn),
):
    geojson_str = json.dumps(req.geometry)
    # 1 degree lon ~ 85km near Madrid; rough conversion is fine for UI proximity
    radius_deg = radius_m / 85000.0
    rows = q(con, """
        WITH input_geom AS (SELECT ST_GeomFromGeoJSON(?::VARCHAR) AS geom),
        cels_points AS (
          SELECT c.id, c.nombre, c.street_norm, c.number_norm, c.reference AS cels_ref, c.auto_CEL,
                 ST_Centroid(b.geom) AS point_geom
          FROM autoconsumos_CELS c
          JOIN buildings b ON LEFT(UPPER(b.reference),14)=LEFT(UPPER(c.reference),14)
        ),
        input_point AS (SELECT ST_Centroid(geom) AS center FROM input_geom)
        SELECT cp.id, cp.nombre, cp.street_norm, cp.number_norm, cp.cels_ref, cp.auto_CEL,
               ST_Distance(cp.point_geom, ip.center) AS distance_deg
        FROM cels_points cp, input_point ip
        WHERE ST_Distance(cp.point_geom, ip.center) <= ?
        ORDER BY distance_deg;
    """, [geojson_str, radius_deg])
    cels = []
    for row in rows:
        dist_m = (float(row[6]) * 85000.0) if row[6] is not None else None
        cels.append({
            "id": row[0],
            "nombre": row[1] or "(sin nombre)",
            "street_norm": row[2],
            "number_norm": row[3],
            "reference": row[4],
            "auto_CEL": int(row[5]) if row[5] is not None else None,
            "distance_m": dist_m,
        })
    return {"count": len(cels), "cels": cels, "radius_m": radius_m}

@app.get("/debug/cels/count")
def debug_cels_count(con: duckdb.DuckDBPyConnection = Depends(get_conn)):
    try:
        count_cels = q(con, "SELECT COUNT(*) FROM autoconsumos_CELS")[0][0]
        count_matches = q(con, """
            SELECT COUNT(*)
            FROM buildings b
            JOIN autoconsumos_CELS c
              ON LEFT(UPPER(b.reference), 14) = LEFT(UPPER(c.reference), 14)
        """)[0][0]
        sample = q(con, """
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

# ============================================================
# CADASTRE
# ============================================================

@app.get("/cadastre/feature")
def cadastre_by_refcat(
    refcat: str = Query(..., description="Referencia catastral"),
    include_feature: bool = Query(False, description="Incluir geometría GeoJSON"),
    con: duckdb.DuckDBPyConnection = Depends(get_conn),
):
    ref_norm = refcat.strip()

    if not include_feature:
        exists = q(con, "SELECT 1 FROM buildings WHERE UPPER(reference)=UPPER(?) LIMIT 1", [ref_norm])
        if not exists:
            raise HTTPException(404, "Referencia catastral no encontrada")
        return {"reference": ref_norm}

    rows = q(con, """
        WITH f AS (
          SELECT geom, * EXCLUDE (geom)
          FROM buildings
          WHERE UPPER(reference)=UPPER(?)
          LIMIT 1
        )
        SELECT ST_AsGeoJSON(geom), to_json(f) FROM f;
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
