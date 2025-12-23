import React from "react";
import { Box, Typography, useTheme } from "@mui/material";
import { tokens } from "../data/theme";

/**
 * SubUpBar reusable con colores por props.
 *
 * Props:
 * - title: string | ReactNode
 * - rightText?: string | ReactNode
 * - bgColor?: string
 * - borderColor?: string
 * - titleColor?: string
 * - rightTextColor?: string
 * - height?: number|string
 * - sx?: object (se mezcla con el sx base)
 */
export default function SubUpBarColor({
  title,
  rightText = null,
  bgColor,
  borderColor,
  titleColor,
  rightTextColor,
  height = "auto",
  sx = {},
}) {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);

  // Defaults (si no pasas props, mantiene un estilo razonable)
  const _bg = bgColor ?? "#f43653";
  const _border = borderColor ?? _bg;
  const _titleColor = titleColor ?? colors.gray[900];
  const _rightColor = rightTextColor ?? colors.gray[900];

  return (
    <Box
      display="flex"
      p={1}
      height={height}
      sx={{
        borderBottom: 1,
        borderColor: _border,
        backgroundColor: _bg,
        ...sx,
      }}
    >
      {/* Izquierda: título */}
      <Box display="flex" flex={1} alignItems="center" justifyContent="flex-start">
        <Typography
          variant="h4"
          fontFamily="rubik"
          fontWeight={800}
          pl="10px"
          sx={{ color: _titleColor, marginRight: "10px" }}
        >
          {title}
        </Typography>
      </Box>

      {/* Derecha: texto opcional */}
      <Box display="flex" flex={1} alignItems="center" justifyContent="flex-end">
        {rightText ? (
          <Typography
            variant="h4"
            fontFamily="rubik"
            fontWeight={300}
            pl="10px"
            sx={{ color: _rightColor, marginRight: "10px" }}
          >
            {rightText}
          </Typography>
        ) : null}
      </Box>
    </Box>
  );
}
