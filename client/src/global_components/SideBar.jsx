/* Fichero del componente para la sidebar de la izquierda */

import { Sidebar, Menu, MenuItem, useProSidebar, sidebarClasses} from "react-pro-sidebar";
import { Box, IconButton, Typography, useTheme } from "@mui/material";
import { tokens } from "../data/theme";
import { Link } from "react-router-dom";
import MenuOutlinedIcon from "@mui/icons-material/MenuOutlined";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import CampaignIcon from '@mui/icons-material/Campaign';
import ContactPhoneIcon from '@mui/icons-material/ContactPhone';
import MapIcon from "@mui/icons-material/Map";
import WbSunnyRoundedIcon from "@mui/icons-material/WbSunnyRounded";


function SideBar() {
  const theme = useTheme();
  const colors = tokens(theme.palette.mode);
  const { collapseSidebar, toggleSidebar, collapsed, toggled, broken, rtl } =
    useProSidebar();
  return (
    //Index so the leaflet map isnt on top of the sidebar
    <Box display={"flex"} height={"100%"} zIndex={900}>
      <Sidebar
        defaultCollapsed={true}
        rootStyles={{
          [`.${sidebarClasses.container}`]: {
            backgroundColor: colors.primary[100],
          },
        }}
        width="210px"
      >
        <Menu>
          <MenuItem
            // sidebar close
            onClick={() => {
              collapseSidebar();
            }}
            icon={collapsed ? <MenuOutlinedIcon color="red" /> : undefined}
            style={{
              margin: "5px 0 10px 0",
            }}
          >
            {!collapsed && (
              <Box
                display="flex"
                justifyContent="space-between"
                alignItems="center"
              >
                <Typography variant="h3" color={colors.gray[200]}>
                  EMSV Getafe
                </Typography>
                <IconButton>
                  <MenuOutlinedIcon />
                </IconButton>
              </Box>
            )}
          </MenuItem>
          <Box
            display={"flex"}
            flexDirection={"column"}
            justifyContent={"space-between"}
            alignItems={"space-between"}
          >
            <Box>
              <MenuItem
                style={{
                  color: colors.gray[100],
                }}
                icon={<HomeOutlinedIcon />}
                component={<Link to="/" />}
              >
                Inicio
              </MenuItem>
              <MenuItem
                style={{ color: colors.gray[100] }}
                icon={<WbSunnyRoundedIcon />}
                component={<Link to="/mapas" />}>
                Mapa Solar
              </MenuItem>
              <MenuItem
                style={{
                  color: colors.gray[100],
                }}
                icon={<CampaignIcon />}
                component="a"           // Convierte el MenuItem en un enlace
                href="https://emsvgetafe.org/hogares/ayudas-para-viviendas/" // URL externa
                target="_blank"         // Abre en una nueva pestaña
                rel="noopener noreferrer" // Añade seguridad en enlaces externos
              >
                Convocatorias
              </MenuItem>
              <MenuItem
                style={{
                  color: colors.gray[100],
                }}
                icon={<ContactPhoneIcon />}
                component="a"           // Convierte el MenuItem en un enlace
                href="https://emsvgetafe.org/contacto/" // URL externa
                target="_blank"         // Abre en una nueva pestaña
                rel="noopener noreferrer" // Añade seguridad en enlaces externos
              >
                Contacto
              </MenuItem>
            </Box>

            {!collapsed && (
              <Box
                display={"flex"}
                flexDirection={"column"}
                justifyContent={"end"}
                flexGrow={1}
                height={"15vh"}
              >
                <MenuItem
                  href="https://khoraurbanthinkers.es/"
                  target="_blank"
                >
                  <Typography color={colors.primary[600]} align="center">
                    Desarrollado por
                    <br />
                    Khora Urban Thinkers
                  </Typography>
                </MenuItem>
              </Box>
            )}
          </Box>
        </Menu>
      </Sidebar>
    </Box>
  );
}

export default SideBar;
