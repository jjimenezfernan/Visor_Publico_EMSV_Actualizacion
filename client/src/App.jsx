import { useState } from "react";
import { ColorModeContext, useMode } from "./data/theme";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";

import Overlay from "./global_components/Overlay";

import VisorEMSV from "./pages/VisorEMSV";
import MapasExtra from "./pages/newMaps";

import MapEMSVProvider from "./components/MapEMSVProvider";
import MapZoomProvider from "./components/MapZoomProvider";
import MapTypeSelectProvider from "./components/MapTypeSelectProvider";

import LayoutDefault from "./global_components/LayoutDefault";
import LayoutMapas from "./global_components/LayoutMapas";

function App() {
  const [theme, colorMode] = useMode();
  const location = useLocation();
  const [showOverlay, setShowOverlay] = useState(true);

  const closeOverlay = () => setShowOverlay(false);
  const shouldShowOverlay = showOverlay && location.pathname === "/";

  return (
    <AnimatePresence>
      <ColorModeContext.Provider value={colorMode}>
        <ThemeProvider theme={theme}>
          <CssBaseline />

          {shouldShowOverlay && <Overlay closeOverlay={closeOverlay} />}

          <Routes location={location} key={location.pathname}>
            {/* Layout normal */}
            <Route element={<LayoutDefault />}>
              <Route
                path="/"
                element={
                  <MapEMSVProvider>
                    <MapZoomProvider>
                      <MapTypeSelectProvider>
                        <VisorEMSV />
                      </MapTypeSelectProvider>
                    </MapZoomProvider>
                  </MapEMSVProvider>
                }
              />
            </Route>

            {/* Layout mapas (UpBar amarillo + logos) */}
            <Route element={<LayoutMapas />}>
              <Route
                path="/mapas"
                element={
                  <MapEMSVProvider>
                    <MapZoomProvider>
                      <MapTypeSelectProvider>
                        <MapasExtra />
                      </MapTypeSelectProvider>
                    </MapZoomProvider>
                  </MapEMSVProvider>
                }
              />
            </Route>
          </Routes>
        </ThemeProvider>
      </ColorModeContext.Provider>
    </AnimatePresence>
  );
}

export default App;
