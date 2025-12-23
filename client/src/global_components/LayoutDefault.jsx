import SideBar from "../global_components/SideBar";
import UpBar from "../global_components/UpBar";
import Footer from "../global_components/Footer";
import { Outlet } from "react-router-dom";

export default function LayoutDefault() {
  return (
    <div className="app">
      <SideBar />
      <main className="content">
        <UpBar />
        <div className="map_footer">
          <Outlet />
          <Footer />
        </div>
      </main>
    </div>
  );
}
