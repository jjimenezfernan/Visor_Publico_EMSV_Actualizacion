// components/RightLayerPanel.jsx
import { useTheme } from "@mui/material/styles";
import {
  Box, Typography, Paper, Stack, Divider, Switch, Button,
} from "@mui/material";
import { tokens } from "../data/theme";

// Small helper to render "Label — Value"
function InfoRow({ label, value }) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      justifyContent="space-between"
      sx={{ py: 0.25 }}
    >
      <Typography variant="body2">{label}</Typography>
      <Typography variant="body2" color="text.secondary">
        {value ?? "–"}
      </Typography>
    </Stack>
  );
}

// Let title be ANY React node (so we can insert a Switch on the right)
function Section({ title, children, headerBg }) {
  return (
    <Box sx={{ backgroundColor: "#f3f4f6", borderRadius: 2, p: 1.5 }}>
      <Box
        sx={{
          background: headerBg,
          borderRadius: "6px",
          px: "0.6rem",
          py: "0.35rem",
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

export default function RightLayerPanel({
  irradianceOn, celsOn, certificateOn, zoom,
  celsHits = [], celsHitsLoading = false, celsHitsError = "",
  onToggleIrradiance, onToggleCELS, onToggleCertificate, onJumpToIrradianceZoom,
  buildingRef = null, buildingMetrics = null, buildingMetricsLoading = false, buildingMetricsError = ""
}) {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const inIrradianceZoom = zoom >= 17 && zoom <= 18;

  // ===== Helpers de formato y cálculo =====
  const isNum = (v) => Number.isFinite(Number(v));
  const fmt = (v, d = 1) => (isNum(v) ? Number(v).toFixed(d) : "–");
  const pct = (v, d = 1) => (isNum(v) ? `${Number(v).toFixed(d)}%` : "–");
  const safeDiv = (a, b) => (isNum(a) && isNum(b) && Number(b) !== 0 ? Number(a) / Number(b) : null);

  const m = buildingMetrics || {};

  // Derivados
  const pctSuperficieUtil = safeDiv(m.superficie_util_m2, m.area_m2) != null
    ? safeDiv(m.superficie_util_m2, m.area_m2) * 100
    : null;

  const prodEspecifica = safeDiv(m.energy_total_kWh, m.pot_kWp); // kWh/kWp·año
  const densidadPot = safeDiv(m.pot_kWp, m.superficie_util_m2);   // kWp/m²

  return (
    <Stack spacing={2}>
      {/* ===== IRRADIANCIA (no accordion) ===== */}
      <Section
        headerBg={colors.blueAccent[400]}
        title={
          <Box sx={{ display: "flex", alignItems: "center", width: "100%" }}>
            <Typography variant="h6" fontWeight={600} sx={{ fontSize: 16, lineHeight: 1.2 }}>
              Mapa de irradiancia
            </Typography>
            <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 1 }}>
              <Typography variant="body2" sx={{ color: "rgba(255,255,255,.9)" }}>
                Mostrar capa
              </Typography>
              <Switch checked={irradianceOn} onChange={onToggleIrradiance} />
            </Box>
          </Box>
        }
      >
        {/* Aviso de zoom */}
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
              <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 700 }}>
                Datos Energéticos
              </Typography>

              {buildingRef && <InfoRow label="Ref. catastral" value={buildingRef} />}

              {/* ======= ORDEN EXACTO DEL EXCEL ======= */}
              <InfoRow
                label="Radiación solar anual (kWh/m²)"
                value={fmt(m.irr_mean_kWhm2_y ?? m.irr_average, 1)}
              />
              <InfoRow label="Horas de sol directo (h/día)" value="–" />
              <InfoRow label="Edificios dentro del buffer de una CEL" value="–" />
              <InfoRow label="Número de usuarios del autoconsumo compartido" value="–" />
              <InfoRow label="Edificios dentro del buffer de un autoconsumo compartido" value="–" />
              <InfoRow label="Calificación energética (A–G)" value="–" />
              <InfoRow
                label="Superficie útil para instalación fotovoltaica (m²)"
                value={fmt(m.superficie_util_m2, 1)}
              />
               <InfoRow
                label="Área total (m²)"
                value={fmt(m.area_m2, 1)}
              />
              <InfoRow
                label="Porcentaje de superficie útil (%)"
                value={pct(pctSuperficieUtil, 1)}
              />
              <InfoRow
                label="Potencia fotovoltaica instalable (kWp)"
                value={fmt(m.pot_kWp, 1)}
              />
              <InfoRow
                label="Energía fotovoltaica anual estimada (kWh/año)"
                value={fmt(m.energy_total_kWh, 0)}
              />
              <InfoRow
                label="Irradiancia media anual (kWh/m²·año)"
                value={fmt(m.irr_mean_kWhm2_y ?? m.irr_average, 1)}
              />
              <InfoRow
                label="Factor de capacidad (%)"
                value={fmt(m.factor_capacidad_pct, 1)}
              />
              <InfoRow
                label="Producción específica (kWh/kWp·año)"
                value={fmt(prodEspecifica, 1)}
              />
              <InfoRow
                label="Densidad de potencia (kWp/m²)"
                value={fmt(densidadPot, 3)}
              />
              <InfoRow label="Reducción potencial de emisiones (tCO₂/año)" value="–" />
              <InfoRow label="Ahorro económico estimado (€ / año)" value="–" />
              {/* ======================================= */}

              {/* Extras informativos (opcionales) */}
              <Divider sx={{ my: 1 }} />
              <InfoRow label="Área de cubierta (m²)" value={fmt(m.area_m2, 1)} />
            </>
          )}

          {!buildingRef && !buildingMetricsLoading && !buildingMetricsError && (
            <Typography variant="caption" color="text.secondary">
              Selecciona un edificio en el mapa o con el buscador.
            </Typography>
          )}
        </Box>
      </Section>

      {/* ===== Certificados (placeholder) ===== */}
      <Section title="Certificados Energéticos" headerBg={colors.blueAccent[400]}>
        <Typography variant="caption" color="text.secondary">
          Información del certificado
        </Typography>
      </Section>

      {/* ===== CELS ===== */}
      <Section title="CELS y Autoconsumo" headerBg={colors.blueAccent[400]}>
        <Stack spacing={1.25}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography>Mostrar capa</Typography>
            <Switch checked={celsOn} onChange={onToggleCELS} />
          </Stack>

          <Typography variant="caption" color="text.secondary">
            Visualiza el área potencial de una Comunidad Energética alrededor de cada CELS.
          </Typography>

          <Divider sx={{ my: 0.5 }} />
          <Typography fontWeight={600} variant="body2">
            CELS que cubren el edificio seleccionado
          </Typography>

          {celsHitsLoading && <Typography variant="caption">Buscando CELS…</Typography>}

          {celsHitsError && (
            <Typography variant="caption" color="error">{celsHitsError}</Typography>
          )}

          {!celsHitsLoading && !celsHitsError && (
            celsHits.length ? (
              <Stack spacing={0.5}>
                {celsHits.map(c => (
                  <Box key={c.id} sx={{ p: 0.75, borderRadius: 1, border: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}>
                    <Typography variant="body2" fontWeight={600}>{c.nombre || "(sin nombre)"}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Ref: {c.reference} · auto_CEL: {String(c.auto_CEL)} · distancia: {Math.round(c.distance_m)} m
                    </Typography>
                  </Box>
                ))}
              </Stack>
            ) : (
              <Typography variant="caption" color="text.secondary">
                Ningún CELS cubre este edificio.
              </Typography>
            )
          )}
        </Stack>
      </Section>
    </Stack>
  );
}
