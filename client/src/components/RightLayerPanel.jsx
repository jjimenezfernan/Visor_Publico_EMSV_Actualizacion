// components/RightLayerPanel.jsx
import { useTheme } from "@mui/material/styles";
import {
  Box, Typography, Paper, Stack, Divider, Switch, Button,
  Accordion, AccordionSummary, AccordionDetails
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { tokens } from "../data/theme";

function LegendMini() {
  const BINS = [
    { min:2,  max:4,  color:"#d1d5db" },
    { min:4,  max:6,  color:"#9ca3af" },
    { min:6,  max:8,  color:"#6b7280" },
    { min:8,  max:10, color:"#4b5563" },
    { min:10, max:17, color:"#111827" },
  ];
  return (
    <Box sx={{ mt: 0.5, p: 1, borderRadius: 1, bgcolor: "background.paper", border: "1px solid", borderColor: "divider" }}>
      <Typography variant="caption" fontWeight={700} sx={{ display: "block", mb: 0.5 }}>
        Horas de sombra
      </Typography>
      {BINS.map((b, i) => (
        <Stack key={i} direction="row" spacing={1} alignItems="center" sx={{ mb: 0.25 }}>
          <span style={{ width: 12, height: 12, borderRadius: 999, background: b.color, display: "inline-block", border: "1px solid #999" }} />
          <Typography variant="caption">{b.min}–{b.max} h</Typography>
        </Stack>
      ))}
    </Box>
  );
}

function Section({ title, children, headerBg }) {
  // Outer container copies your grey background card with rounded corners.
  return (
    <Box sx={{ backgroundColor: "#f3f4f6", borderRadius: 2, p: 1.5 }}>
      <Typography
        variant="h6"
        color="#fff"
        fontWeight={600}
        sx={{
          background: headerBg,
          borderRadius: "6px",
          px: "0.6rem",
          py: "0.35rem",
          mb: 1.2,
          lineHeight: 1.2,
          fontSize: 16,
        }}
      >
        {title}
      </Typography>

      {/* Inner card (white) to match the search box body */}
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

const accordionSx = {
  "&.MuiAccordion-root": {
    backgroundColor: "#ffffff",
    borderRadius: 1.5,
    border: "1px solid",
    borderColor: "divider",
    boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
    overflow: "hidden",
  },
  "& .MuiAccordionSummary-root": {
    minHeight: 44,
    px: 1.25,
  },
  "& .MuiAccordionDetails-root": {
    p: 1.25,
    pt: 0.5,
  },
};

export default function RightLayerPanel({
  irradianceOn, celsOn, certificateOn, zoom,
  celsHits = [], celsHitsLoading = false, celsHitsError = "",
  onToggleIrradiance, onToggleCELS, onToggleCertificate, onJumpToIrradianceZoom
}) {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const inIrradianceZoom = zoom >= 17 && zoom <= 18;

  return (
    <Stack spacing={2}>
      {/* IRRADIANCE */}
      <Section title="Irradiancia" headerBg={colors.blueAccent[400]}>
        <Accordion disableGutters square sx={accordionSx}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography fontWeight={600}>Mapa de sombras</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={1.25}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography>Mostrar capa</Typography>
                <Switch checked={irradianceOn} onChange={onToggleIrradiance} />
              </Stack>
              <Divider />
              {inIrradianceZoom ? (
                <Typography variant="caption">Visible en niveles de zoom <b>17–18</b>.</Typography>
              ) : (
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="caption">Necesitas zoom 17–18 para ver la capa.</Typography>
                  <Button size="small" variant="contained" onClick={onJumpToIrradianceZoom}>
                    Ir a zoom óptimo
                  </Button>
                </Stack>
              )}
              <LegendMini />
            </Stack>
          </AccordionDetails>
        </Accordion>
      </Section>
        


      {/* CERTIFICATE */}
      <Section title="Certificados Energéticos" headerBg={colors.blueAccent[400]}>
        <Accordion disableGutters square sx={accordionSx}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography fontWeight={600}>Información del certificado</Typography>
          </AccordionSummary>
          <AccordionDetails>
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

              {celsHitsLoading && (
                <Typography variant="caption">Buscando CELS…</Typography>
              )}

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
                  <Typography variant="caption" color="text.secondary">Ningún CELS cubre este edificio.</Typography>
                )
              )}

            </Stack>
          </AccordionDetails>
        </Accordion>
      </Section>


      {/* CELS / ENERGY COMMUNITY */}
      <Section title="CELS / Autoconsumos energéticos" headerBg={colors.blueAccent[400]}>
        <Accordion disableGutters square defaultExpanded sx={accordionSx}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography fontWeight={600}>CELS (radio 500 m)</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={1.25}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography>Mostrar capa</Typography>
                <Switch checked={celsOn} onChange={onToggleCELS} />
              </Stack>
              <Typography variant="caption" color="text.secondary">
                Visualiza el área potencial de una Comunidad Energética alrededor de cada CELS.
              </Typography>
            </Stack>
          </AccordionDetails>
        </Accordion>
      </Section>
    </Stack>
  );
}
