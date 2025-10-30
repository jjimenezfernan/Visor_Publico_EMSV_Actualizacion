// TopCenterLegend.jsx
import React from "react";

/**
 * Leyenda continua centrada arriba:
 * - Recibe bins [{min,max,color}], o bien un array de colores.
 * - Muestra etiqueta izquierda y derecha con unidades.
 */
export default function TopCenterLegend({
  bins = [],                 // [{min,max,color}] o []
  colors = [],               // alternativa: ["#f7fcb9","#addd8e",...]
  leftLabel = "",            // ej. "1122 kWh/m²·año"
  rightLabel = "",           // ej. "2414 kWh/m²·año"
  top = 8,                   // separación desde arriba (px)
  width = 420,               // ancho de la barra (px)
  height = 14,               // alto de la barra (px)
  className = "",
}) {
  // Obtener paleta
  const palette = colors.length
    ? colors
    : (bins.length ? bins.map(b => b.color) : ["#f7fcb9","#addd8e","#78c679","#41ab5d","#238443","#005a32"]);

  // Gradiente CSS
  const gradient = `linear-gradient(90deg, ${palette.join(",")})`;

  return (
    <div
      className={className}
      style={{
        position: "absolute",
        top,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1100,
        pointerEvents: "none",
        background: "white",
        borderRadius: 6,
        boxShadow: "0 2px 8px rgba(0,0,0,.18)",
        padding: "6px 10px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        font: "13px system-ui",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ opacity: .9 }}>{leftLabel} &lt;</span>

      <div style={{
        width,
        height,
        background: gradient,
        borderRadius: 4,
        outline: "1px solid rgba(0,0,0,.12)",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,.5)"
      }}/>

      <span style={{ opacity: .9 }}>&gt; {rightLabel}</span>
    </div>
  );
}
