import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet.pattern";



export default function BuildingsCertificateLayer({ bbox, mode, apiBase, onBuildingClick }) {
  const map = useMap();
  const layerRef = useRef(null);
  const abortRef = useRef(null);
  const paneName = "cert-pane";

  const energyColorByLetter = {
    A: "#4CAF50",
    B: "#8BC34A",
    C: "#CDDC39",
    D: "#FFEB3B",
    E: "#FFC107",
    F: "#FF9800",
    G: "#F44336",
  };
  // dentro del componente
    const patternsRef = useRef(null);

    useEffect(() => {
    if (!map) return;

    // crea patrones 1 vez
    if (!patternsRef.current) {
        const makePattern = (color) => {
        const p = new L.StripePattern({
            weight: 3,
            spaceWeight: 5,
            color,
            opacity: 0.9,
            spaceOpacity: 0.0,
            angle: 45,
        });
        p.addTo(map);
        return p;
        };

        patternsRef.current = {
        A: makePattern("#4CAF50"),
        B: makePattern("#8BC34A"),
        C: makePattern("#CDDC39"),
        D: makePattern("#FFEB3B"),
        E: makePattern("#FFC107"),
        F: makePattern("#FF9800"),
        G: makePattern("#F44336"),
        _: makePattern("#BDBDBD"),
        };
    }
    }, [map]);


  const pickLetterAndEstimated = (props) => {
    if (!props) return { letter: null, estimated: true };
    if (mode === "co2") {
      return {
        letter: (props.certificadoCO2 || "").toString().toUpperCase(),
        estimated: Number(props.certificadoCO2_es_estimado) === 1,
      };
    }
    return {
      letter: (props.cal_norenov || "").toString().toUpperCase(),
      estimated: Number(props.cal_norenov_es_estimado) === 1,
    };
  };

  useEffect(() => {
    if (!map) return;

    if (!map.getPane(paneName)) {
      const p = map.createPane(paneName);
      p.style.zIndex = 470; // por encima de buildings normales
    }
  }, [map]);

  useEffect(() => {
    if (!map || !bbox || !mode) return;

    if (layerRef.current) {
      map.removeLayer(layerRef.current);
      layerRef.current = null;
    }
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const params = new URLSearchParams({
      bbox: bbox.join(","),
      mode,
      limit: "50000",
      offset: "0",
    });

    const url = `${apiBase}/buildings/certificates?${params}`;

    (async () => {
      try {
        const res = await fetch(url, { signal: ac.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const fc = await res.json();
        if (ac.signal.aborted) return;

        const feats = (fc?.features || []).filter(f => f?.geometry);

        const lyr = L.geoJSON(feats, {
          pane: paneName,
          interactive: true,
          style: (f) => {
            const { letter, estimated } = pickLetterAndEstimated(f.properties);
            const base = energyColorByLetter[letter] || "#BDBDBD";
            const outline = estimated ? "#00000025" : "#00000035";

            if (estimated) {
                const pat = (patternsRef.current?.[letter] || patternsRef.current?._);
                return {
                color: outline,
                weight: 0.8,
                fillPattern: pat,     // 👈 rayas
                fillOpacity: 1,       // con patrón suele ir a 1
                };
            }

            return {
                color: outline,
                weight: 0.8,
                fillColor: base,
                fillOpacity: 0.75,
            };
            },
          onEachFeature: (feature, layer) => {
            layer.on("click", () => onBuildingClick?.(feature));
          },
        });

        lyr.addTo(map);
        layerRef.current = lyr;
      } catch (e) {
        if (e.name !== "AbortError") console.error("BuildingsCertificateLayer:", e);
      }
    })();

    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (layerRef.current && map) map.removeLayer(layerRef.current);
      layerRef.current = null;
    };
  }, [map, bbox, mode, apiBase, onBuildingClick]);

  return null;
}
