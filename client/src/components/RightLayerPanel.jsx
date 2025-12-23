// components/RightLayerPanel.jsx
// components/RightLayerPanel.jsx
import { useTheme } from "@mui/material/styles";
import {
  Box, Typography, Paper, Stack, Divider, Switch, Button, IconButton,
} from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { useState,useEffect } from "react";
import { tokens } from "../data/theme";
import SearchBoxEMSV from "../components/SearchBoxEMSV_irr";
import Link from "@mui/material/Link";




const isFiniteNum = (v) => Number.isFinite(Number(v));

const fmtPct = (v, d = 0) =>
  isFiniteNum(v) ? `${Number(v).toFixed(d)}%` : "–";

const fmtInt = (v, suf = "") =>
  isFiniteNum(v) ? `${Math.round(Number(v))}${suf}` : "–";






import Tooltip from "@mui/material/Tooltip";

function InfoRow({ label, value, unit, description }) {
  return (
    <Box sx={{ py: 0.4 }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Typography
            sx={{ fontSize: 14, fontWeight: 400, lineHeight: 1 }}
          >
            {label}
          </Typography>

          {description && (
            <Tooltip
              title={
                <Typography sx={{ fontSize: "0.8rem", lineHeight: 1.5 }}>
                  {description}
                </Typography>
              }
              arrow
              placement="top"
              enterDelay={200}
              leaveDelay={200}
              componentsProps={{
                tooltip: {
                  sx: {
                    bgcolor: "rgba(0, 0, 0, 0.92)",
                    color: "#fff",
                    fontSize: "1rem",           // fallback size
                    fontWeight: 400,
                    lineHeight: 1.5,
                    maxWidth: 380,
                    p: 1.5,                     // more internal padding = more comfortable
                    borderRadius: 2,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                  },
                },
                arrow: {
                  sx: {
                    color: "rgba(0, 0, 0, 0.92)",
                  },
                },
              }}
            >
              <IconButton size="small" sx={{ p: 0.2 }}>
                <InfoOutlinedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>

        {/* Value + unit */}
        <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.6 }}>
          <Typography
            sx={{
              fontSize: 14,
              fontWeight: 700,
              lineHeight: 0.9,
              color: "text.primary",
            }}
          >
            {value ?? "–"}
          </Typography>
          {unit && (
            <Typography
              sx={{ fontSize: 13, fontWeight: 700, color: "text.secondary" }}
            >
              {unit}
            </Typography>
          )}
        </Box>
      </Stack>
    </Box>
  );
}


/*
// Let title be ANY React node (so we can insert a Switch on the right)
function Section({ title, children, headerBg }) {
  return (
    <Box sx={{ backgroundColor: "#f3f4f6", borderRadius: 2, p: 1.5 }}>
      <Box
        sx={{
          background: headerBg,
          borderRadius: "6px",
          px: "0.6rem",
          py: "0.15rem",
          mb: 1.2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: "#fff",
        }}
      >
        {typeof title === "string" ? (
          <Typography variant="h6" fontWeight={600} sx={{ lineHeight: 1.2, fontSize: 16 }}>
            {title}
          </Typography>
        ) : (
          title
        )}
      </Box>

      <Paper
        elevation={0}
        sx={{
          p: 1,
          borderRadius: 2,
          backgroundColor: "#f8fafc",
          border: "1px solid",
          borderColor: "divider",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        }}
      >
        {children}
      </Paper>
    </Box>
  );
}
*/


function Section({ title, children, headerBg, noPaper = false }) {
  return (
    <Box sx={{ backgroundColor: "#f3f4f6", borderRadius: 2, p: 1.5 }}>
      <Box
        sx={{
            background: headerBg,
            borderRadius: "6px",
            px: "0.6rem",
            py: "0.15rem",
            mb: 0.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            color: "#fff",
          }}
      >
        {typeof title === "string" ? (
          <Typography variant="h6" fontWeight={600} sx={{ lineHeight: 1.2, fontSize: 16 }}>
            {title}
          </Typography>
        ) : (
          title
        )}
      </Box>

      {noPaper ? (
        <>{children}</>
      ) : (
        <Paper
          elevation={0}
          sx={{
            p: 1,
            borderRadius: 2,
            backgroundColor: "#f8fafc",
            border: "1px solid",
            borderColor: "divider",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
          {children}
        </Paper>
      )}
    </Box>
  );
}




// Colores por letra (A = más eficiente, G = menos eficiente)
const energyColorByLetter = {
  A: "#4CAF50", // verde
  B: "#8BC34A",
  C: "#CDDC39",
  D: "#FFEB3B",
  E: "#FFC107",
  F: "#FF9800",
  G: "#F44336", // rojo
};


function EnergyCertificate({ title, rating, isEstimated, date }) {
  const letter = (rating || "").toString().toUpperCase();
  const color = energyColorByLetter[letter] || "#BDBDBD";
  const hasLetter = !!energyColorByLetter[letter];
  const fmtDateEs = (s) => {
    if (!s) return "";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString("es-ES");
  };

  const showDate = hasLetter && !isEstimated && !!date;

  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography sx={{ fontSize: 14, fontWeight: 600, mb: 0.5, color: "text.primary" }}>
        {title}
      </Typography>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Box
          sx={{
            clipPath: "polygon(0 0, 88% 0, 100% 50%, 88% 100%, 0 100%)",
            px: 1.8,
            py: 0.6,
            minWidth: 52,
            bgcolor: color,
            opacity: isEstimated ? 0.75 : 1,
            borderRadius: 0.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Typography sx={{ fontSize: 16, fontWeight: 800, color: "#fff", lineHeight: 1 }}>
            {hasLetter ? letter : "–"}
          </Typography>
        </Box>

        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {hasLetter ? `Fuente: ${isEstimated ? "estimado" : "oficial"}` : "Sin información de certificado"}
          {showDate ? ` · Fecha: ${fmtDateEs(date)}` : ""}
        </Typography>
      </Box>
    </Box>
  );
}





export default function RightLayerPanel({
  irradianceOn, celsOn, certificateOn, certMode, zoom,
  celsHits = [], celsHitsLoading = false, celsHitsError = "",
  onToggleIrradiance, onToggleCELS, onToggleCertificate, onJumpToIrradianceZoom,
  buildingRef = null, buildingMetrics = null, buildingMetricsLoading = false, buildingMetricsError = "",
  shadowStats = null, shadowLoading = false, shadowError = "",
  searchJsonRef = null, searchLoading = false,  searchApiBase = "",  onSearchFeature = null,  onSearchReset = null,
  onSelectCertificateMode = null, onClearCertificateMode = null,
}) {

  const isCo2Active = certificateOn && certMode === "co2";
  const isNoRenovActive = certificateOn && certMode === "norenov";


  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const inIrradianceZoom = zoom >= 17 && zoom <= 18;

  // ===== Helpers de formato y cálculo =====
  const isNum = (v) => Number.isFinite(Number(v));
  const fmt = (v, d = 1) => (isNum(v) ? Number(v).toFixed(d) : "–");
  const pct = (v, d = 1) => (isNum(v) ? `${Number(v).toFixed(d)}%` : "–");
  const safeDiv = (a, b) => (isNum(a) && isNum(b) && Number(b) !== 0 ? Number(a) / Number(b) : null);
  const safeSub = (a, b) => (isNum(a) && isNum(b) ? Number(a) - Number(b) : null);

  const m = buildingMetrics || {};

const E = Number(m.energy_total_kWh);

// precios desde la API (tablas DuckDB)
const Pener = Number(m?.precio_energia_eur_kwh);
const Pexc  = Number(m?.precio_energia_eur_kwh_excedente);

// Ahorro estimado: 50% autoconsumo al precio energía + 50% excedente al precio excedente
const ahorroEstimado =
  Number.isFinite(E) && Number.isFinite(Pener) && Number.isFinite(Pexc)
    ? E * (Pener * 0.5 + Pexc * 0.5)
    : null;


  const sunDirectAvgFromAPI = shadowStats?.sun_avg;
  const shadowAvg = shadowStats?.avg;
  const assumedDayLength = isNum(shadowStats?.dayLength_h) ? shadowStats.dayLength_h : 12;
  const sunDirectAvgComputed = safeSub(assumedDayLength, shadowStats?.avg);

  // elegimos qué mostrar
  const sunDirectToShow = isNum(sunDirectAvgFromAPI) ? sunDirectAvgFromAPI : sunDirectAvgComputed;


  // Derivados
  const pctSuperficieUtil = safeDiv(m.superficie_util_m2, m.area_m2) != null
    ? safeDiv(m.superficie_util_m2, m.area_m2) * 100
    : null;

  const prodEspecifica = safeDiv(m.energy_total_kWh, m.pot_kWp); // kWh/kWp·año
  const densidadPot = safeDiv(m.pot_kWp, m.superficie_util_m2);   // kWp/m²



  const precioEnergia = Number(m?.precio_energia_eur_kwh);
  const Eanual = Number(m?.energy_total_kWh);

  const ahorroMaximo =
    Number.isFinite(Eanual) && Number.isFinite(precioEnergia)
      ? Eanual * precioEnergia
      : null;

  if (process.env.NODE_ENV !== "production") {
    console.log("precioEnergia:", precioEnergia, "Eanual:", m?.energy_total_kWh, "ahorroMaximo:", ahorroMaximo);
  }

  return (
    <Stack spacing={1.5} sx={{ fontFamily: theme.typography.fontFamily }}>
       {/* === Buscador de Direcciones === */}
      <Section
        headerBg="#DF9A32"
        title="Buscador de Direcciones"
        noPaper
      >
        <SearchBoxEMSV
          jsonRef={searchJsonRef}
          loading={searchLoading}
          apiBase={searchApiBase}
          onFeature={onSearchFeature}
          onReset={onSearchReset}
        />
      </Section>
      {/* ===== CELS ===== */}
      <Section 
        headerBg="#DF9A32"
        title={
          <Box sx={{ display: "flex", alignItems: "center", width: "100%" }}>
            <Typography variant="h6" fontWeight={600} sx={{ fontSize: 16, lineHeight: 1.2 }}>
              CELS y Autoconsumo
            </Typography>
            <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 0.5 }}>
              <Typography variant="caption" sx={{ color: "rgba(255,255,255,.9)" }}>
                {celsOn ? "Ocultar capa" : "Mostrar capa"}
              </Typography>
              <Switch size="small" checked={celsOn} onChange={onToggleCELS} />
            </Box>
          </Box>
        }
     >    
 
          {celsHitsLoading && <Typography variant="caption">Buscando CELS…</Typography>}
          {celsHitsError && (
            <Typography variant="caption" color="error">{celsHitsError}</Typography>
          )}
          {/* ...dentro de la sección CELS... */}
          {!celsHitsLoading && !celsHitsError && (
            celsHits.length ? (
              <Stack spacing={0.75}>
                {celsHits.map((c) => {
                  const props = c?.properties ?? c; // por si viene anidado
                  const num = (v) => {
                    const n = Number(v);
                    return Number.isFinite(n) ? n : null;
                  };
                  // lee con tolerancia a alias
                  let occ = num(
                    props.por_ocupacion ??
                    props.por_ocupacion_pct ??
                    props.por_ocup ??
                    props.occupancy_pct ??
                    props.occupancy
                  );

                  // si llega como ratio (0–1), pásalo a %
                  if (occ != null && occ > 0 && occ <= 1) occ = occ * 100;
                                    const occRaw =
                    c.por_ocupacion ??
                    c.por_ocupacion_pct ??
                    c.por_ocup ??
                    c.occupancy_pct ??
                    c.occupancy ??
                    null;
                 
                  const dist = num(c.distance_m);

                  const street = c.street_norm || c.street || c.calle || "";
                  const number = c.number_norm ?? c.numero ?? "";
                  const canJoin = occ != null && occ < 100;
                  const tipo = c.auto_CEL === 1 ? "CEL" : "Autoconsumo Compartido";
                    if (process.env.NODE_ENV !== "production") {
                       console.log("CEL hit debug:", c);
                  }
                  return (
                    <Box
                      key={c.id}
                      sx={{
                        p: 1,
                        borderRadius: 1,
                        border: "1px solid",
                        borderColor: "divider",
                        bgcolor: "background.paper",
                      }}
                    >
                      
                      <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 15, lineHeight: 1.1 }}>
                        {c.nombre || "(sin nombre)"}
                      </Typography>

                      {/* 1ª fila: ref catastral + calle y número */}
                      <Typography variant="body1" color="text.secondary" sx={{ display: "block", mt: 0.75 ,fontSize: "0.9rem"}}>
                        Referencia catastral y calle: <strong>{c.reference || "–"}</strong>
                        {(street || number) && (
                          <>
                            {"  -  "} <strong>{street}{number ? ` ${number}` : ""}</strong>
                          </>
                        )}
                      </Typography>
                      {/* 2ª fila: resto de datos */}
                      <Typography variant="body1" color="text.secondary" sx={{ display: "block", mt: 0.25,fontSize: "0.9rem" }}>
                        Tipo: <strong>{tipo}</strong>
                        {"  -  "}
               
                        Ocupación: <strong>{occ != null ? `${occ.toFixed(0)}%` : "–"}</strong>

                        {"  -  "}
                        Distancia: <strong>{dist != null ? `${Math.round(dist)} m` : "–"}</strong>
                      </Typography>
                      
                      <Typography
                        variant="body1"
                        color="text.secondary"
                        sx={{ display: "block", mt: 0.25, fontSize: "0.9rem" }}
                      >
                        Si quieres unirte a esta  &nbsp;<strong>{tipo}</strong>,&nbsp;
                        {canJoin ? (
                          <Link
                            href="https://emsvgetafe.org/hogares/comunidades-energeticas-residenciales/"
                            target="_blank"
                            rel="noopener noreferrer"
                            underline="always"
                            sx={{
                              color: "inherit",        
                              fontWeight: 700,
                              cursor: "pointer",
                              textDecorationThickness: "2px",
                              "&:hover": {
                                textDecorationColor: "currentColor",
                              },
                            }}
                          >
                            pulsa aquí
                          </Link>
                        ) : (
                          <Typography
                            component="span"
                            sx={{
                              color: "inherit",       
                              fontWeight: 700,
                              opacity: 0.6,           
                            }}
                          >
                            no disponible (ocupación 100%)
                          </Typography>
                        )}
                      </Typography>
                    </Box>
                  );
                })}
              </Stack>
            ) : (
              <Typography variant="caption" color="text.secondary">
                Ningún CELS o autoconsumo compartido cubre este edificio.
              </Typography>
            )
          )}


      </Section>
      {/* ===== IRRADIANCIA (no accordion) ===== */}
      <Section
        headerBg="#DF9A32"
        title={
          <Box sx={{ display: "flex", alignItems: "center", width: "100%" }}>
            <Typography variant="h6" fontWeight={600} sx={{ fontSize: 16, lineHeight: 1.2 }}>
              Datos energéticos
            </Typography>
            <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 0.5 }}>
              <Typography variant="caption" sx={{ color: "rgba(255,255,255,.9)" }}>
                {irradianceOn ? "Ocultar capa" : "Mostrar capa"}
              </Typography>
              <Switch size="small" checked={irradianceOn} onChange={onToggleIrradiance} />
            </Box>
          </Box>
        }
      >
        { /*viso de zoom
        {!inIrradianceZoom && (
          <Box sx={{ mb: 1 }}>
            <Typography variant="caption">
              Necesitas zoom <b>17–18</b> para ver la capa.
            </Typography>{" "}
            <Button size="small" variant="contained" onClick={onJumpToIrradianceZoom} sx={{ ml: 1 }}>
              Ir a zoom óptimo
            </Button>
          </Box>
        )}
        A */}

        {/* Panel de indicadores */}
        <Box
          sx={{
            p: 1,
            borderRadius: 1,
            backgroundColor: "#fff",
            border: "1px solid",
            borderColor: "divider",
          }}
        >
          {buildingMetricsLoading && (
            <Typography variant="caption">Cargando información…</Typography>
          )}

          {buildingMetricsError && (
            <Typography variant="caption" color="error">
              {buildingMetricsError}
            </Typography>
          )}

          {!buildingMetricsLoading && !buildingMetricsError && (
            <>
          
              <InfoRow
                label="Radiación solar anual (kWh/m²)"
                value={fmt(m.irr_mean_kWhm2_y ?? m.irr_average, 1)}
                description="Energía solar media que recibe cada metro cuadrado de la cubierta en un año."
              />
              {/*
              <InfoRow
                label="Horas de sol directo (h/día)"
                value={fmt(shadowAvg, 2)}
                description="Número medio de horas al día en las que la cubierta recibe sol directo sin sombras."
              />
              */}
              {/*<InfoRow label="Edificios dentro del buffer de una CEL" value="–" />*/}
              {/*<InfoRow label="Número de usuarios del autoconsumo compartido" value="–" />*/}
              {/*<InfoRow label="Edificios dentro del buffer de un autoconsumo compartido" value="–" />*/}
              {/*<InfoRow label="Calificación energética (A–G)" value="–" />*/}

              <InfoRow
                label="Superficie útil para instalación fotovoltaica (m²)"
                value={fmt(m.superficie_util_m2, 1)}
                description="Superficie estimada disponible para colocar paneles solares."
              />

              {/*<InfoRow label="Porcentaje de superficie útil (%)" value={pct(pctSuperficieUtil, 1)} />*/}

              <InfoRow
                label="Potencia fotovoltaica instalable (kWp)"
                value={fmt(m.pot_kWp, 1)}
                description="Potencia pico máxima que podría instalarse en la superficie útil."
              />

              <InfoRow
                label="Energía fotovoltaica anual estimada (kWh/año)"
                value={fmt(m.energy_total_kWh, 0)}
                description="Energía eléctrica aproximada que produciría la instalación en un año."
              />

              {/*<InfoRow label="Irradiancia media anual (kWh/m²·año)" value={fmt(m.irr_mean_kWhm2_y ?? m.irr_average, 1)}/>*/}
              {/*<InfoRow label="Factor de capacidad (%)" value={fmt(m.factor_capacidad_pct, 1)}/>*/}
              {/*<InfoRow label="Producción específica (kWh/kWp·año)" value={fmt(prodEspecifica, 1)}/>*/}
              {/*<InfoRow label="Densidad de potencia (kWp/m²)" value={fmt(densidadPot, 3)} />*/}

              <InfoRow
                label="Reducción potencial de emisiones (tCO₂/año)"
                value={fmt(m.reduccion_emisiones, 2)}
                description="Toneladas de CO₂ que se dejarían de emitir al generar esta energía con fotovoltaica. Factor: 0,231kgCO₂/kWh"
              />
              <InfoRow
                  label="Ahorro económico estimado (€ / año)"
                  value={fmt(ahorroEstimado, 2)}
                  description={
                    `Ahorro anual estimado con un reparto 50% autoconsumo y 50% excedentes.\n` +
                    `Precio energía: ${Number.isFinite(Pener) ? `${Pener} €/kWh` : "–"}\n` +
                    `Precio excedente: ${Number.isFinite(Pexc) ? `${Pexc} €/kWh` : "–"}\n` +
                    `% autoconsumo = % excedentes = 0,5`
                  }
                />
              <InfoRow
                label="Máximo ahorro económico estimado (€ / año)"
                value={fmt(ahorroMaximo, 2)}
                description={
                `Ahorro anual máximo en la factura eléctrica si se aprovecha toda la energía generada.\n`+
                `Precio energía: ${Number.isFinite(Pener) ? `${Pener} €/kWh` : "–"}`
                }
              />


              {/*<InfoRow label="Área total (m²)" value={fmt(m.area_m2, 1)}/>*/}


            </>
          )}
          
          {/*
          {!buildingRef && !buildingMetricsLoading && !buildingMetricsError && (
            <Typography variant="caption" color="text.secondary">
              Selecciona un edificio en el mapa o con el buscador.
            </Typography>
          )}
          */}
        </Box>
      </Section>

      {/* ===== Certificados Energéticos ===== */}
      <Section title="Certificados Energéticos" headerBg="#DF9A32">
        {!buildingMetricsLoading && !buildingMetricsError && (
          <Box>
            <Box
              sx={{
                cursor: "pointer",
                p: 0.5,
                borderRadius: 1,
                outline: isCo2Active ? "2px solid rgba(59,130,246,0.8)" : "2px solid transparent",
              }}
              onClick={() => onSelectCertificateMode?.("co2")}
            >
              <EnergyCertificate
                title="Certificado Emisiones (CO₂)"
                rating={m.certificadoCO2}
                isEstimated={Number(m.certificadoCO2_es_estimado) === 1}
                date={m.certificado_fecha_oficial}
              />
            </Box>

            <Divider sx={{ my: 1 }} />

            <Box
              sx={{
                cursor: "pointer",
                p: 0.5,
                borderRadius: 1,
                outline: isNoRenovActive ? "2px solid rgba(59,130,246,0.8)" : "2px solid transparent",
              }}
              onClick={() => onSelectCertificateMode?.("norenov")}
            >
              <EnergyCertificate
                title="Certificado de consumo (energía no renovable)"
                rating={m.cal_norenov}
                isEstimated={Number(m.cal_norenov_es_estimado) === 1}
                date={m.certificado_fecha_oficial}
              />
            </Box>

            {/* botón para apagar el modo */}
            <Typography
              variant="caption"
              sx={{ display: "inline-block", mt: 0.5, cursor: "pointer", textDecoration: "underline" }}
              onClick={() => onClearCertificateMode?.()}
            >
              Quitar coloreado de certificados
            </Typography>
          </Box>
        )}
        {(buildingMetricsLoading || buildingMetricsError) && (
          <Typography
            variant="caption"
            color={buildingMetricsError ? "error" : "text.secondary"}
          >
            {buildingMetricsError || "Cargando certificados…"}
          </Typography>
        )}
      </Section>
    </Stack>
  );
}
