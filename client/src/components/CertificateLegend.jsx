// CertificateLegend.jsx
import { useMemo } from "react";

const energyColorByLetter = {
  A: "#4CAF50", B: "#8BC34A", C: "#CDDC39",
  D: "#FFEB3B", E: "#FFC107", F: "#FF9800", G: "#F44336",
};

export default function CertificateLegend({ visible, mode }) {
  const title = mode === "co2"
    ? "Certificado Emisiones (CO₂)"
    : "Certificado Consumo (no renovable)";

  const letters = useMemo(() => ["A","B","C","D","E","F","G"], []);

  if (!visible) return null;

  return (
    <div style={{
      position: "absolute",
      right: 12,
      bottom: 20,
      zIndex: 600,
      pointerEvents: "none",
      background: "white",
      padding: "10px 12px",
      borderRadius: 10,
      boxShadow: "0 2px 10px rgba(0,0,0,0.18)",
      font: "12px system-ui",
      minWidth: 210
    }}>
      <div style={{ fontWeight: 800, marginBottom: 6 }}>{title}</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
        {letters.map(L => (
          <div key={L} style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{
              width: 14, height: 14, borderRadius: 4,
              background: energyColorByLetter[L],
              border: "1px solid #999"
            }} />
            <span><b>{L}</b></span>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 8, display:"flex", alignItems:"center", gap:8 }}>
        <span style={{
          width: 18, height: 14, borderRadius: 4,
          border: "1px solid #999",
          background:
            "repeating-linear-gradient(45deg, #666 0 3px, transparent 3px 7px)"
        }} />
        <span>Estimado (rayado)</span>
      </div>
    </div>
  );
}
