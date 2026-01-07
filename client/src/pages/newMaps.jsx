// newMap.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Box,
  Typography,
  useTheme,
} from "@mui/material";

import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw";
import * as turf from "@turf/turf";
import { tokens } from "../data/theme";
import StaticBuildingsLayer from "../components/BuildingsLayer";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import MapLoadingOverlay from "../components/PantallaCarga";
import SubUpBarColor from "../global_components/SubUpBarColor"

//const API_BASE = "http://127.0.0.1:8000

const API_BASE = "https://visorpublicoemsvactualizado.khoraurbanthinkers.es/api_2";

import { DIRECTION } from "../data/direccion_server";
const EMSV_URL = `${DIRECTION}/api/visor_emsv`;
import { useLayoutEffect } from "react";
import RightLayerPanel from "../components/RightLayerPanel";
import BuildingsCertificateLayer from "../components/BuildingsCertificateLayer";
import CertificateLegend from "../components/CertificateLegend";


// ---- leyenda irradiancia ----
// kWh/m²·año (ajusta rangos si tu dataset tiene otros valores)
// ---- leyenda irradiancia (kWh/m²·a) ----
// rangos de tu imagen
const IRR_BINS = [
  { min: 183.78,  max: 1112.49, color: "#053bd3" },
  { min: 1112.49, max: 1491.41, color: "#28b6f6" },
  { min: 1491.41, max: 1735.46, color: "#6ee7b7" },
  { min: 1735.46, max: 1925.95, color: "#f7e52b" },
  { min: 1925.95, max: 2087.72, color: "#ffaa00" },
  { min: 2087.72, max: 2237.07, color: "#ff7043" },
  { min: 2237.07, max: 2663.09, color: "#d32f2f" },
];

const colorForIrr = (v) => {
  if (v == null || Number.isNaN(v)) return "#cccccc";
  for (const b of IRR_BINS) if (v >= b.min && v < b.max) return b.color;
  // si supera el último max, usamos el último color
  return IRR_BINS[IRR_BINS.length - 1].color;
};


function LegendIrr({ minZoom = 17, maxZoom = 19 }) {
  const map = useMap();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!map) return;
    const check = () => setVisible(map.getZoom() >= minZoom && map.getZoom() <= maxZoom);
    map.on("zoomend", check); check();
    return () => map.off("zoomend", check);
  }, [map, minZoom, maxZoom]);

  if (!visible) return null;

  return (
    <div style={{
      position: "absolute", right: 5, bottom: 20, zIndex: 500,
      pointerEvents: "none", background: "white", padding: "8px 10px",
      borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.15)", font: "12px system-ui"
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Irradiancia (kWh/m²·año)</div>
      {IRR_BINS.map((b, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", margin: "2px 0" }}>
          <span style={{
            display: "inline-block", width: 12, height: 12, borderRadius: 9999,
            background: b.color, marginRight: 8, border: "1px solid #999"
          }} />
          <span>{b.min} – {b.max}</span>
        </div>
      ))}
    </div>
  );
}




// ---- leyenda ----
const BINS = [
  { min: 2,  max: 4,  color: "#d1d5db" },
  { min: 4,  max: 6,  color: "#9ca3af" },
  { min: 6,  max: 8,  color: "#6b7280" },
  { min: 8,  max: 10, color: "#4b5563" },
  { min: 10, max: 17, color: "#111827" },
];
const colorForShadowCount = (v) => {
  if (v == null) return "#cccccc";
  for (const b of BINS) if (v >= b.min && v < b.max) return b.color;
  if (v >= BINS[BINS.length - 1].min) return BINS[BINS.length - 1].color;
  return "#cccccc";
};



// ---------- helpers ----------
async function fetchCELSHitsForGeometryDynamic(geom) {
  const resp = await fetch(`${API_BASE}/cels/within_dynamic`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ geometry: geom }),
  });
  if (!resp.ok) throw new Error(`CELS HTTP ${resp.status}`);
  const json = await resp.json();
  return json.cels || [];
}



function BboxWatcher({ onBboxChange }) {
  const map = useMap();
  useEffect(() => {
    let t;
    const DEBOUNCE = 280;
    const update = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const b = map.getBounds();
        onBboxChange([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
      }, DEBOUNCE);
    };
    map.on("moveend", update);
    update();
    return () => { clearTimeout(t); map.off("moveend", update); };
  }, [map, onBboxChange]);
  return null;
}



function IrradianceLayer({ bbox, minZoom = 17, maxZoom = 19 }) {
  const map = useMap();
  const currentRef = useRef(null);
  const nextRef = useRef(null);
  const abortRef = useRef(null);
  const prevFetchBBoxRef = useRef(null);
  const rendererRef = useRef(null);

  const paneName = "irr-pane";
  const CHUNK_SIZE = 2000;
  const CHUNK_DELAY = 16;
  const PANE_FADE_MS = 180;

  // helpers
  const setPaneOpacity = (v) => { const p = map?.getPane?.(paneName); if (p) p.style.opacity = String(v); };
  const inRange = () => {
    const z = map?.getZoom?.() ?? 0;
    return z >= minZoom && z <= maxZoom;
  };
  const pointRadiusForZoom = (z) => Math.max(1.2, Math.min(0.6 + (z - 15) * 0.9, 3.5));
  const padBBox = ([w, s, e, n], r = 0.12) => {
    const dx = (e - w) * r, dy = (n - s) * r;
    return [w - dx, s - dy, e + dx, n + dy];
  };
  const shouldRefetch = (newB, oldB) => {
    if (!oldB) return true;
    const [w1, s1, e1, n1] = newB; const [w0, s0, e0, n0] = oldB;
    const width = Math.max(1e-9, e0 - w0), height = Math.max(1e-9, n0 - s0);
    return (
      Math.abs(w1 - w0) > width * 0.12 ||
      Math.abs(e1 - e0) > width * 0.12 ||
      Math.abs(s1 - s0) > height * 0.12 ||
      Math.abs(n1 - n0) > height * 0.12
    );
  };
  const progressivelyAdd = (fc, lyr, signal) => {
    const feats = fc.features || [];
    let i = 0;
    const step = () => {
      if (signal.aborted) return;
      const next = feats.slice(i, i + CHUNK_SIZE);
      if (next.length) {
        lyr.addData({ type: "FeatureCollection", features: next });
        i += next.length;
        setTimeout(step, CHUNK_DELAY);
      }
    };
    step();
  };

  // create pane + renderer once
  useEffect(() => {
    if (!map) return;
    if (!map.getPane(paneName)) {
      const p = map.createPane(paneName);
      p.style.zIndex = 430;
      p.style.transition = `opacity ${PANE_FADE_MS}ms ease`;
      p.style.pointerEvents = "none";
      p.style.mixBlendMode = "multiply";
      p.style.opacity = "1";
    }
    if (!rendererRef.current) rendererRef.current = L.canvas({ padding: 0.5 });
  }, [map]);

  // fetch/swap logic
  useEffect(() => {
    if (!map || !bbox || !inRange()) {
      if (currentRef.current) { map.removeLayer(currentRef.current); currentRef.current = null; }
      // make sure pane is visible if we leave the range
      setPaneOpacity(1);
      return;
    }

    const padded = padBBox(bbox, 0.1);
    if (!shouldRefetch(padded, prevFetchBBoxRef.current)) {
      // only update marker radius on zoom
      const r = pointRadiusForZoom(map.getZoom());
      if (currentRef.current) currentRef.current.eachLayer((m) => m.setRadius?.(r));
      return;
    }

    // abort previous
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const params = new URLSearchParams({ bbox: padded.join(","), limit: "100000", offset: "0" });
    const url = `${API_BASE}/irradiance/features?${params}`;

    // start fade (very small fade so it never “sticks invisible”)
    setPaneOpacity(0.2);

    (async () => {
      try {
        const res = await fetch(url, { signal: ac.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const fc = await res.json();
        if (ac.signal.aborted) return;

        const features = fc?.features || [];
        if (!features.length) {
          // nothing new → keep the current layer, just restore opacity
          prevFetchBBoxRef.current = padded;
          setPaneOpacity(1);
          return;
        }

        const r = pointRadiusForZoom(map.getZoom());
        const lyr = L.geoJSON(null, {
          pane: paneName,
          renderer: rendererRef.current,
          interactive: false,
          pointToLayer: (f, latlng) => {
            const v = f.properties?.value;
            const c = colorForIrr(v);
            return L.circleMarker(latlng, {
              radius: 1.5,
              stroke: false,
              fillColor: c,
              fillOpacity: 1.25,   // keep <= 1
              renderer: rendererRef.current,
              pane: paneName,
            });
          },
          style: (f) => {
            const v = f.properties?.value;
            const c = colorForIrr(v);
            return { color: c, weight: 0, fillColor: c, fillOpacity: 1 };
          },
        });

        lyr.addTo(map);
        nextRef.current = lyr;

        // add progressively
        progressivelyAdd(fc, lyr, ac.signal);
        // swap when done (queue a microtask so the last chunk paints)
        setTimeout(() => {
          if (ac.signal.aborted) return;
          if (currentRef.current) map.removeLayer(currentRef.current);
          currentRef.current = nextRef.current;
          nextRef.current = null;
          prevFetchBBoxRef.current = padded;
          setPaneOpacity(1); // ALWAYS restore
        }, CHUNK_DELAY + 4);
      } catch (e) {
        if (e.name !== "AbortError") console.error("Irradiance fetch error:", e);
        // on error/abort also restore opacity
        setPaneOpacity(1);
      }
    })();

    return () => {
      if (nextRef.current) { map.removeLayer(nextRef.current); nextRef.current = null; }
    };
  }, [map, bbox, minZoom, maxZoom]);

  // keep radii in sync on zoom
  useEffect(() => {
    if (!map) return;
    const onZoomEnd = () => {
      const r = pointRadiusForZoom(map.getZoom());
      if (currentRef.current) currentRef.current.eachLayer((m) => m.setRadius?.(r));
    };
    map.on("zoomend", onZoomEnd);
    return () => map.off("zoomend", onZoomEnd);
  }, [map]);

  // cleanup
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (nextRef.current && map) map.removeLayer(nextRef.current);
      if (currentRef.current && map) map.removeLayer(currentRef.current);
      nextRef.current = null;
      currentRef.current = null;
    };
  }, [map]);

  return null;
}


function useMapZoom() {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map?.getZoom?.() ?? 0);
  useEffect(() => {
    const on = () => setZoom(map.getZoom());
    map.on("zoomend", on);
    on();
    return () => map.off("zoomend", on);
  }, [map]);
  return zoom;
}

function LegendContinuous({ bins, title = "Irradiancia (kWh/m²·año)", visible=true }) {
  if (!visible || !bins?.length) return null;
  return (
    <div style={{
      position: "absolute", right: 5, bottom: 20, zIndex: 500,
      pointerEvents: "none", background: "white", padding: "8px 10px",
      borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.15)", font: "12px system-ui"
    }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{title}</div>
      {bins.map((b,i)=>(
        <div key={i} style={{ display:"flex", alignItems:"center", margin:"2px 0" }}>
          <span style={{
            display:"inline-block", width:12, height:12, borderRadius:9999,
            background:b.color, marginRight:8, border:"1px solid #999"
          }}/>
          <span>{b.min.toFixed(0)} – {b.max.toFixed(0)}</span>
        </div>
      ))}
    </div>
  );
}


// Creates N equal-interval bins for [min,max]
function makeEqualBins(min, max, n = 7) {
  if (!isFinite(min) || !isFinite(max) || min === max) {
    const v = isFinite(min) ? min : 0;
    return [{ min: v, max: v, color: "#cccccc" }];
  }
  const colors = ["#053bd3","#28b6f6","#6ee7b7","#f7e52b","#ffaa00","#ff7043","#d32f2f"];
  const step = (max - min) / n;
  return new Array(n).fill(0).map((_,i) => ({
    min: min + i*step,
    max: i === n-1 ? max : min + (i+1)*step,
    color: colors[Math.min(i, colors.length-1)]
  }));
}

function makeColorForBins(bins) {
  return (v) => {
    if (v == null || Number.isNaN(v)) return "#cccccc";
    for (const b of bins) if (v >= b.min && v <= b.max) return b.color;
    return bins[bins.length-1].color;
  };
}


function BuildingIrradianceLayer({ bbox, onLegendChange,onBuildingClick  }) {
  const map = useMap();
  const layerRef = useRef(null);
  const abortRef = useRef(null);
  const prevBBoxRef = useRef(null);
  const paneName = "bldg-irr-pane";

  useEffect(() => {
    if (!map) return;
    if (!map.getPane(paneName)) {
      const p = map.createPane(paneName);
      p.style.zIndex = 440;           
    }
  }, [map]);

  const shouldRefetch = (b1, b0) => {
    if (!b0) return true;
    const [w1,s1,e1,n1]=b1, [w0,s0,e0,n0]=b0;
    const W=e0-w0, H=n0-s0;
    return Math.abs(w1-w0)>W*0.12 || Math.abs(e1-e0)>W*0.12 || Math.abs(s1-s0)>H*0.12 || Math.abs(n1-n0)>H*0.12;
  };

  useEffect(() => {
    if (!map || !bbox) return;

    if (!shouldRefetch(bbox, prevBBoxRef.current)) return;

    // abort previous fetch
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const params = new URLSearchParams({ bbox: bbox.join(","), limit: "50000", offset: "0" });
    const url = `${API_BASE}/buildings/irradiance?${params}`;

    (async () => {
      try {
        const res = await fetch(url, { signal: ac.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const fc = await res.json();
        if (ac.signal.aborted) return;

        const feats = (fc?.features||[]).filter(f => f?.geometry);
        // compute bins from visible buildings
        const values = feats.map(f => f.properties?.irr_building).filter(v => typeof v === "number" && isFinite(v));
        const min = Math.min(...values);
        const max = Math.max(...values);
        const bins = makeEqualBins(min, max, 7);
        const colorFor = makeColorForBins(bins);
        onLegendChange?.(bins);

        // build layer
        const lyr = L.geoJSON(feats, {
          pane: paneName,
          interactive: true,
          style: (f) => {
            const v = f.properties?.irr_building;
            const c = colorFor(v);
            return {
              color: "#00000030",
              weight: 0.5,
              fillColor: c,
              fillOpacity: 0.8
            };
          },
          onEachFeature: (feature, layer) => {
            // habilita click directamente sobre el polígono pintado
            layer.on("click", () => {
              // si tienes la feature tal cual del buildings, ya lleva `properties.reference`
              if (typeof onBuildingClick === "function") {
                onBuildingClick(feature);
              }
            });
           }
        });

        // swap layer
        if (layerRef.current) map.removeLayer(layerRef.current);
        lyr.addTo(map);
        layerRef.current = lyr;
        prevBBoxRef.current = bbox;
      } catch (e) {
        if (e.name !== "AbortError") console.error("BuildingIrradianceLayer:", e);
        onLegendChange?.(null);
      }
    })();

    return () => { /* nothing */ };
  }, [map, bbox, onLegendChange, onBuildingClick]);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (layerRef.current && map) map.removeLayer(layerRef.current);
    };
  }, [map]);

  return null;
}


function ZoomAwareIrradiance({ bbox, pointsOn=true, onBuildingClick }) {
  const zoom = useMapZoom();
  const [legendBins, setLegendBins] = useState(null);

  return (
    <>
      {zoom >= 19 && bbox && (
        <>
          <IrradianceLayer bbox={bbox} minZoom={19} maxZoom={19} />
          <LegendIrr minZoom={19} maxZoom={19} />
        </>
      )}

      {zoom >= 13 && zoom <= 18 && bbox && (
        <>
          <BuildingIrradianceLayer
            bbox={bbox}
            onLegendChange={setLegendBins}
            onBuildingClick={onBuildingClick}   // <-- añade esto
          />
          <LegendContinuous bins={legendBins} visible />
        </>
      )}
    </>
  );
}


function BindMapRef({ mapRef }) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
    console.log("Leaflet map listo:", map);
  }, [map, mapRef]);
  return null;
}

function SetupLimitPanes() {
  const map = useMap();
  useEffect(() => {
    if (!map.getPane("limits-casing")) {
      map.createPane("limits-casing");
      map.getPane("limits-casing").style.zIndex = 460;
    }
    if (!map.getPane("limits-dash")) {
      map.createPane("limits-dash");
      map.getPane("limits-dash").style.zIndex = 461;
    }
  }, [map]);
  return null;
}

// Zoom custom (si lo usas)
function CustomZoom({ min=1, max=19, shadowMin=17, shadowMax=19 }) {
  const map = useMap();
  const [z, setZ] = useState(() => map?.getZoom?.() ?? 0);

  useEffect(() => {
    const onZoom = () => setZ(map.getZoom());
    map.on("zoomend", onZoom);
    setZ(map.getZoom());
    return () => map.off("zoomend", onZoom);
  }, [map]);

  const zoomIn  = () => map.setZoom(Math.min(max, (map.getZoom() ?? z) + 1));
  const zoomOut = () => map.setZoom(Math.max(min, (map.getZoom() ?? z) - 1));

  const inRange = z >= shadowMin && z <= shadowMax;
  const badgeBg = inRange ? "#10b981" : "#f59e0b";

  return (
    <div style={{
      background: "white",
      borderRadius: 10,
      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      padding: 10,
      font: "12px system-ui",
      minWidth: 160
    }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ width:10, height:10, borderRadius:9999, background:badgeBg, display:"inline-block" }} />
          <strong>Nivel de zoom</strong>
        </div>
        <span style={{ fontWeight:600 }}>{z}</span>
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <button
          onClick={zoomIn}
          title="Acercar"
          style={{ flex:1, border:"none", borderRadius:8, padding:"6px 0", cursor:"pointer", background:"#3b82f6", color:"#fff", fontWeight:600 }}
        >+</button>
        <button
          onClick={zoomOut}
          title="Alejar"
          style={{ flex:1, border:"none", borderRadius:8, padding:"6px 0", cursor:"pointer", background:"#6b7280", color:"#fff", fontWeight:600 }}
        >−</button>
      </div>
    </div>
  );
}




function useFillToBottom(ref, extraBottom = 0) {
  const [h, setH] = useState(400);
  useLayoutEffect(() => {
    const calc = () => {
      if (!ref.current) return;
      const top = ref.current.getBoundingClientRect().top;
      const height = Math.max(300, window.innerHeight - top - extraBottom);
      setH(height);
    };
    calc();
    window.addEventListener("resize", calc);
    window.addEventListener("orientationchange", calc);
    return () => {
      window.removeEventListener("resize", calc);
      window.removeEventListener("orientationchange", calc);
    };
  }, [ref, extraBottom]);
  return h;
}

function AutoInvalidateOnResize({ observeRef }) {
  const map = useMap();
  useEffect(() => {
    if (!observeRef?.current) return;
    const ro = new ResizeObserver(() => {
      map.invalidateSize({ animate: false });
    });
    ro.observe(observeRef.current);
    map.invalidateSize({ animate: false });
    return () => ro.disconnect();
  }, [map, observeRef]);
  return null;
}

const colorForRadio = (r) => {
  const v = Number(r);
  if (!Number.isFinite(v)) return "#9ca3af";
  if (v <= 500) return "#ff000062";
  if (v <= 1000) return "#84cc16";
  if (v <= 2000) return "#001aff81";
  return "#001eff98";
};

function CelsBufferLayer({ radiusMeters = 1000 }) {
  const map = useMap();
  const layerRef = useRef(null);
  const abortRef = useRef(null);
  const paneName = "cels-pane";

  useEffect(() => {
    if (!map) return;
    if (!map.getPane(paneName)) {
      map.createPane(paneName);
      const p = map.getPane(paneName);
      p.style.zIndex = 560;
      p.style.pointerEvents = "none";
    }
  }, [map]);

  useEffect(() => {
    if (!map) return;
    if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const cityBBox = [-3.766250610351563, 40.279394708323274, -3.685398101806641, 40.32560453181949];
    const params = new URLSearchParams({ bbox: cityBBox.join(","), limit: "20000", offset: "0" });
    const url = `${API_BASE}/cels/features?${params}`;

    (async () => {
      try {
        const res = await fetch(url, { signal: ac.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const group = L.layerGroup(); // ✅ sin pane aquí

        console.log("CELS features:", data.features?.length);

        (data.features || []).forEach((f) => {
          let lat, lng;
          if (f.geometry?.type === "Point") {
            const [x, y] = f.geometry.coordinates;
            lng = x; lat = y;
          } else {
            const center = L.geoJSON(f.geometry).getBounds().getCenter();
            lat = center.lat; lng = center.lng;
          }

          const radio = Number.isFinite(Number(f.properties?.radio))
            ? Number(f.properties.radio)
            : radiusMeters;

          const base = colorForRadio(radio);

          const is2 = Number(f.properties?.auto_CEL) === 2;
          const stroke = is2 ? "#ef4444" : "#2563eb";
          const weight = is2 ? 3 : 2;

          const ring = L.circle([lat, lng], {
            radius: radio,              // ✅ dinámico
            color: stroke,
            weight,
            fillColor: base,
            fillOpacity: 0.25,
            pane: paneName,
            interactive: false,
            bubblingMouseEvents: false,
          });

          const dot = L.circleMarker([lat, lng], {
            radius: 4,
            color: stroke,
            weight: 2,
            fillColor: stroke,
            fillOpacity: 1,
            pane: paneName,
            interactive: false,
            bubblingMouseEvents: false,
          });

          group.addLayer(ring);
          group.addLayer(dot);
        });

        group.addTo(map);
        console.log("group layers:", group.getLayers().length);

        layerRef.current = group;
      } catch (e) {
        if (e.name !== "AbortError") console.error("CELS fetch error:", e);
      }
    })();

    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (layerRef.current && map) map.removeLayer(layerRef.current);
      layerRef.current = null;
    };
  }, [map, radiusMeters]);

  return null;
}




export default function NewMap() {

  const [certificateVisible, setCertificateVisible] = useState(false);
  const [certMode, setCertMode] = useState(null);

  async function fetchBuildingFeatureByRef(ref) {
    const res = await fetch(`${API_BASE}/buildings/by_ref?ref=${encodeURIComponent(ref)}`);
    if (!res.ok) throw new Error(`No building geometry for ${ref} (HTTP ${res.status})`);
    return await res.json(); // ya es Feature
  }

  function ensurePolygonGeom(geom) {
    if (!geom) return null;
    // Si llega Feature, saca geometry
    const g = geom.type === "Feature" ? geom.geometry : geom;
    // Si es Point, lo convertimos a un círculo (para no fallar)
    if (g?.type === "Point" && Array.isArray(g.coordinates)) {
      const [x, y] = g.coordinates;
      return turf.circle([x, y], 12, { units: "meters", steps: 48 }).geometry; // 12m mejor que 8m
    }

    return g;
  }
    async function handleSearchBoxFeature(arg1, arg2, arg3) {
      let feature, popupHtml, refcat;
      if (arg1 && (arg1.type === "Feature" || arg1.geometry)) {
        // Formato (feature, popupHtml, refcat)
        feature = arg1;
        popupHtml = arg2 ?? null;
        refcat = arg3 ?? null;
      } else {
        feature = arg1?.feature ?? null;
        popupHtml = arg1?.popupHtml ?? null;
        refcat = arg1?.refcat ?? null;
      }

      if (!feature) return;

      highlightSelectedFeature(mapRef.current, feature, null);
      const ref =
        refcat ||
        feature?.properties?.reference ||
        feature?.properties?.refcat;

      setBRef(ref || null);

      let buildingFeature = feature;
      if (ref) {
        try {
          buildingFeature = await fetchBuildingFeatureByRef(ref);
          const realRef = buildingFeature?.properties?.reference || ref;
          setBRef(realRef);
          highlightSelectedFeature(mapRef.current, buildingFeature, null);
        } catch (e) {
          console.warn("No pude cargar polígono real, uso feature original:", e);
        }
      }

      
      setBMetrics(null);
      setBMetricsError("");
      setBMetricsLoading(!!ref);

      if (ref) {
        try {
          const { metrics } = await fetchBuildingMetricsByRef(ref);
          setBMetrics(metrics);
        } catch (e) {
          setBMetricsError(e.message || "No se pudieron cargar las métricas.");
        } finally {
          setBMetricsLoading(false);
        }
      }

      const geom = ensurePolygonGeom(buildingFeature);

      if (!geom) {
        setCelsHitsError("Geometría no válida para consultar CELS.");
        setCelsHitsLoading(false);
        setBStatsError("Geometría no válida para calcular sombras.");
        setBStatsLoading(false);
        return;
      }

      // === 1. Shadows stats (independent) ===
      try {
        setBStatsError("");
        setBStatsLoading(true);
        setBStats(null);

        const stats = await fetch(`${API_BASE}/shadows/zonal`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ geometry: geom }),
        }).then(r => r.json());

        setBStats(stats);
      } catch (e) {
        console.error("Shadow stats error:", e);
        setBStatsError("No se pudieron calcular las estadísticas de sombras para este edificio.");
      } finally {
        setBStatsLoading(false);
      }

      // === 2. CELS query (completely independent) ===
      try {
        setCelsHitsError("");
        setCelsHitsLoading(true);
        setCelsHits([]);

        console.log("Calling CELS /within_dynamic with geom:", geom); // ← debug line

        const hits = await fetchCELSHitsForGeometryDynamic(geom);
        setCelsHits(hits);
      } catch (celsError) {
        console.error("CELS fetch error:", celsError);
        setCelsHitsError("No se pudo determinar qué CELS incluyen este edificio.");
        setCelsHits([]);
      } finally {
        setCelsHitsLoading(false);
      }
    }


  function handleSearchBoxReset() {
    clearSelectionAndPopup();
    setBStats(null);
    setBStatsError("");
    setBStatsLoading(false);
    setCelsHits([]);
    setCelsHitsError("");
    setCelsHitsLoading(false);
    setBRef(null);
    setBMetrics(null);
    setBMetricsError("");
    setBMetricsLoading(false);
  }


  const [bRef, setBRef] = useState(null);
  const [bMetrics, setBMetrics] = useState(null);
  const [bMetricsLoading, setBMetricsLoading] = useState(false);
  const [bMetricsError, setBMetricsError] = useState("");

  async function fetchBuildingMetricsByRef(reference) {
    const res = await fetch(`${API_BASE}/buildings/metrics?reference=${encodeURIComponent(reference)}`);
    if (!res.ok) throw new Error(res.status === 404 ? "Sin métricas" : `HTTP ${res.status}`);
    return res.json();
  }


  const [celsHits, setCelsHits] = useState([]);     // CELS that include the selected building
  const [celsHitsLoading, setCelsHitsLoading] = useState(false);
  const [celsHitsError, setCelsHitsError] = useState("");

  const [irradianceVisible, setIrradianceVisible] = useState(true); 
  const [celsVisible, setCelsVisible] = useState(true);
  


  const mapBoxRef = useRef(null);
  const mapHeight = useFillToBottom(mapBoxRef, 8);

  const [shadowsVisible, setShadowsVisible] = useState(false);
  

  const [buildingsLoaded, setBuildingsLoaded] = useState(false);

  const selectionRef = useRef(null);
  const mapRef = useRef(null);

  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  const mapProps = useMemo(() => ({ center: [40.305637, -3.730671], zoom: 15 }), []);
  const [bbox, setBbox] = useState(null);

  // -------- EMSV datasets --------
  const [loadingEmsv, setLoadingEmsv] = useState(true);
  const [errorEmsv, setErrorEmsv] = useState("");
  const [geoLimites, setGeoLimites] = useState(null);
  const [geoConViv, setGeoConViv] = useState(null);
  const [geoSinViv, setGeoSinViv] = useState(null);
  const [jsonRef, setJsonRef] = useState(null);

  // ---------- finder UI state ----------
  const [street, setStreet] = useState("");
  const [portal, setPortal] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  // --- estadísticas del edificio ---
  const [bStats, setBStats] = useState(null);
  const [bStatsLoading, setBStatsLoading] = useState(false);
  const [bStatsError, setBStatsError] = useState("");

  const toggleCertificateMode = (mode) => {
    setCertMode((prev) => (prev === mode ? null : mode));
  };

  useEffect(() => {
    const certOn = Boolean(certMode);

    if (certOn) {
      setIrradianceVisible(false);
      setCelsVisible(false);
      setShadowsVisible(false); // opcional
    } else {
      setIrradianceVisible(true);
      setCelsVisible(true);
    }
  }, [certMode]);

  async function fetchZonalStats(geometry) {
    const res = await fetch(`${API_BASE}/shadows/zonal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ geometry }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // fetch EMSV on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingEmsv(true);
        setErrorEmsv("");
        const res = await fetch(EMSV_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;

        setGeoLimites(data.geo_limites_getafe_emsv ?? null);
        setGeoConViv(data.geo_emsv_parcela_con_vivienda ?? null);
        setGeoSinViv(data.geo_emsv_parcela_sin_vivienda ?? null);
        setJsonRef(data.json_emsv_calle_num_reference ?? null);
      } catch (e) {
        setErrorEmsv("No se pudo cargar el índice de direcciones.");
      } finally {
        if (!cancelled) setLoadingEmsv(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const availableStreets = useMemo(() => {
    if (!jsonRef) return [];
    const streets = new Set();
    if (typeof jsonRef === 'object' && !Array.isArray(jsonRef)) {
      Object.keys(jsonRef).forEach(calle => streets.add(calle));
    }
    return Array.from(streets).sort((a, b) =>
      a.localeCompare(b, 'es', { sensitivity: 'base' })
    );
  }, [jsonRef]);


  function clearSelection(map) {
    if (map && selectionRef.current) {
      map.removeLayer(selectionRef.current);
      selectionRef.current = null;
    }
  }

  function highlightSelectedFeature(map, feature, popupHtml = false) {
    if (!map || !feature) return;

    if (!map.getPane("selection")) {
      map.createPane("selection");
      map.getPane("selection").style.zIndex = 500;
    }
    if (selectionRef.current) {
      map.removeLayer(selectionRef.current);
      selectionRef.current = null;
    }

    const lyr = L.geoJSON(feature, {
      pane: "selection",
      style: { color: "#ff564dff", weight: 1, fillColor: "#ff9f0a", fillOpacity: 0.25 },
      pointToLayer: (_f, latlng) =>
        L.circleMarker(latlng, { radius: 8, color: "#ff3b30", weight: 3, fillColor: "#ff9f0a", fillOpacity: 0.6 })
    }).addTo(map);
    selectionRef.current = lyr;

    const g = feature.geometry;
    if (g?.type === "Point" && Array.isArray(g.coordinates)) {
      const [x, y] = g.coordinates;
      map.setView([y, x], 19);
    } else {
      const b = lyr.getBounds?.();
      if (b && b.isValid()) map.fitBounds(b.pad(0.4));
    }


  }




  const clearSelectionAndPopup = () => {
    const map = mapRef.current;
    if (!map) return;
    if (selectionRef.current) {
      map.removeLayer(selectionRef.current);
      selectionRef.current = null;
    }
    map.closePopup();
  };

  const handleSearch = async () => {
    setSearchError("");
    const calle = street.trim();
    const numero = portal.trim();
    if (!calle || !numero) {
      setSearchError("Introduce calle y número.");
      return;
    }

    setSearching(true);
    try {
      const qs = new URLSearchParams({
        street: calle,
        number: numero,
        include_feature: "true",
      });
      const res = await fetch(`${API_BASE}/address/lookup?${qs}`);
      if (!res.ok) {
        setSearchError(res.status === 404 ? "Dirección no encontrada." : `Error ${res.status}`);
        return;
      }
      const data = await res.json();
      if (!data.feature) {
        setSearchError("Referencia encontrada pero sin geometría.");
        return;
      }
      if ((data.features || []).length) {
        const f0 = data.features[0];
        console.log("first CELS point:", f0.geometry);
      }
      const feature = data.feature;
      await handleSearchBoxFeature({
        feature,
        popupHtml: null,
        refcat: data.refcat || data.reference || feature?.properties?.reference || feature?.properties?.refcat
      });
    } catch (e) {
      console.error(e);
      setSearchError("No se pudo buscar la dirección.");
    } finally {
      setSearching(false);
    }
  };

  const handleReset = () => {
    setStreet("");
    setPortal("");
    setSearchError("");
    clearSelection(mapRef.current);
    clearSelectionAndPopup();
  };

  const bounds = [
    [40.279393, -3.766208],
    [40.338090, -3.646864],
  ];

  const handleBuildingClick = async (feature) => {
    highlightSelectedFeature(mapRef.current, feature, null);

    const reference = feature?.properties?.reference || feature?.properties?.refcat;

    setBRef(reference || null);
    setBMetrics(null);
    setBMetricsError("");
    setBMetricsLoading(!!reference);

    if (reference) {
      try {
        const { metrics } = await fetchBuildingMetricsByRef(reference);
        setBMetrics(metrics);
      } catch (e) {
        setBMetricsError(e.message || "No se pudieron cargar las métricas.");
      } finally {
        setBMetricsLoading(false);
      }
    }



  
    let geom = feature?.geometry ?? feature;
    if (geom?.type === "Point" && Array.isArray(geom.coordinates)) {
      const [x, y] = geom.coordinates;
      const circle = turf.circle([x, y], 8, { units: "meters", steps: 48 });
      geom = circle.geometry;
    }

    // 1) sombras (igual que antes)
    // Fetch shadows
    try {
      setBStatsError("");
      setBStatsLoading(true);
      setBStats(null);
      const stats = await fetch(`${API_BASE}/shadows/zonal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ geometry: geom }),
      }).then(r => r.json());
      setBStats(stats);
    } catch (e) {
      console.error("Shadow stats error:", e);
      setBStatsError("No se pudieron calcular las estadísticas de sombras para este edificio.");
    } finally {
      setBStatsLoading(false);
    }

    // Fetch CELS independently
    try {
      setCelsHitsError("");
      setCelsHitsLoading(true);
      setCelsHits([]);
      const hits = await fetchCELSHitsForGeometryDynamic(geom);
      setCelsHits(hits);
    } catch (celsError) {
      console.error("CELS fetch error:", celsError);
      setCelsHitsError("No se pudo determinar qué CELS incluyen este edificio.");
      setCelsHits([]);
    } finally {
      setCelsHitsLoading(false);
    }
  };


    useEffect(() => {
      const p = mapRef.current?.getPane?.("cels-pane");
      if (p) p.style.opacity = celsVisible ? "1" : "0";
    }, [celsVisible]);


  

  return (
    <>
      <SubUpBarColor
        title={"Visor de datos públicos de potencial fotovoltaico y comunidades energéticas"}
        crumbs={[["Inicio", "/"], ["Visor EPIU", "/visor-epiu"]]}
        info={{ title: "Visor de datos públicos de potencial fotovoltaico y comunidades energéticas", description: (<Typography />) }}
        bgColor="#F0BE00"
        borderColor="#F0BE00"
      />
      <Box m="10px">
        <Grid container spacing={2} alignItems="stretch">
          <Grid item xs={12} md={8}>
            <Box
              ref={mapBoxRef}
              sx={{
                height: mapHeight,
                minHeight: 380,
                bgcolor: "#f9fafb",
                borderRadius: "10px",
                overflow: "hidden",
                position: "relative",
              }}
            >
              <MapContainer
                center={[40.307927, -3.732297]}
                minZoom={14}
                maxZoom={19}
                zoom={mapProps.zoom}
                maxBounds={bounds}
                maxBoundsViscosity={1.0}
                zoomControl={false}
                style={{ height: "100%", width: "100%", background: "#f3f4f6" }}
              >
                <AutoInvalidateOnResize observeRef={mapBoxRef} />
                <MapLoadingOverlay loading={!buildingsLoaded} />
                <StaticBuildingsLayer
                  apiBase={API_BASE}
                  onLoadComplete={() => setBuildingsLoaded(true)}
                  onBuildingClick={handleBuildingClick}
                  clickable={!shadowsVisible && !(certificateVisible && certMode)}
                />
                <BindMapRef mapRef={mapRef} />
                <SetupLimitPanes />
                <BboxWatcher onBboxChange={setBbox} />
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                  attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                  subdomains={["a", "b", "c", "d"]}
                  maxZoom={19}
                  opacity={0.8}
                  zIndex={0}
                />

                <CertificateLegend visible={certificateVisible && !!certMode} mode={certMode} />

                {/* 
                {irradianceVisible && (
                  <>
                    {bbox && <IrradianceLayer  bbox={bbox} minZoom={17} maxZoom={19} />}
                    <LegendIrr  minZoom={17} maxZoom={19} />
                  </>
                )}
                */}
                {irradianceVisible && <ZoomAwareIrradiance bbox={bbox} onBuildingClick={handleBuildingClick} />}



                {celsVisible && <CelsBufferLayer radiusMeters={2000} />}
                
                {geoLimites && (
                  <LayerGeoJSON
                    fc={geoLimites}
                    style={{
                      pane: "limits-dash",
                      color: "#c5c5c5ff",
                      weight: 2,
                      opacity: 1,
                      dashArray: "6 6",
                      fillOpacity: 0,
                      interactive: false,
                      lineCap: "butt",
                      lineJoin: "round",
                      smoothFactor: 1.2,
                    }}
                  />
                )}

                {certificateVisible && certMode && (
                  <BuildingsCertificateLayer
                    bbox={bbox}
                    mode={certMode}               // "co2" o "norenov"
                    apiBase={API_BASE}
                    onBuildingClick={handleBuildingClick}
                  />
                )}


              </MapContainer>
            </Box>
          </Grid>

          <Grid item xs={12} md={4}>
            <Stack spacing={1} sx={{ height: "100%" }}>
              {/* Panel de capas (Irradiance / CELS / Certificate) */}
              <RightLayerPanel
                irradianceOn={irradianceVisible}
                celsOn={celsVisible}
                certificateOn={certificateVisible}
                certMode={certMode}
                onSelectCertificateMode={(mode) => {
                  if (!certificateVisible) setCertificateVisible(true);
                  setCertMode(mode);
                }}
                onClearCertificateMode={() => setCertMode(null)}
                zoom={mapRef.current?.getZoom?.() ?? 0}
                celsHits={celsHits}
                celsHitsLoading={celsHitsLoading}
                celsHitsError={celsHitsError}
                onToggleIrradiance={() => setIrradianceVisible(v => !v)}
                onToggleCELS={() => setCelsVisible(v => !v)}
                onToggleCertificate={() => {
                  setCertificateVisible(v => {
                    const next = !v;
                    if (next) {
                      setIrradianceVisible(false);
                      setCelsVisible(false);
                      setShadowsVisible(false);
                      // si no hay modo aún, puedes dejar uno por defecto:
                      setCertMode(prev => prev || "co2");
                    } else {
                      setCertMode(null);
                    }
                    return next;
                  });
                }}
                onJumpToIrradianceZoom={() => {
                  const z = mapRef.current?.getZoom?.() ?? 0;
                  const target = z < 17 ? 17 : z > 18 ? 18 : z;
                  mapRef.current?.flyTo(mapRef.current.getCenter(), target, { duration: 0.6 });
                }}
                buildingRef={bRef}
                buildingMetrics={bMetrics}
                buildingMetricsLoading={bMetricsLoading}
                buildingMetricsError={bMetricsError}
                shadowStats={bStats}
                shadowLoading={bStatsLoading}
                shadowError={bStatsError}
                searchJsonRef={jsonRef}
                searchLoading={loadingEmsv}
                searchApiBase={API_BASE}
                onSearchFeature={handleSearchBoxFeature}
                onSearchReset={handleSearchBoxReset}                
              />

            </Stack>
          </Grid>
        </Grid>
      </Box>
    </>
  );
}

function LayerGeoJSON({ fc, style }) {
  const map = useMap();
  const ref = useRef(null);
  useEffect(() => {
    if (!fc) return;
    if (ref.current) { map.removeLayer(ref.current); ref.current = null; }
    const lyr = L.geoJSON(fc, { style });
    lyr.addTo(map);
    ref.current = lyr;
    return () => { if (ref.current) map.removeLayer(ref.current); };
  }, [map, fc, style]);
  return null;
}