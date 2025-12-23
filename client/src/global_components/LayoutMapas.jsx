import SideBar from "../global_components/SideBar";
import UpBarYellow from "../global_components/UpBarYellow";
import Footer from "../global_components/Footer";
import { Outlet } from "react-router-dom";

export default function LayoutMapas() {
  return (
    <div className="app">
      <SideBar />
      <main className="content">
        <UpBarYellow />
        <div className="map_footer">
          <Outlet />
          <Footer />
        </div>
      </main>
    </div>
  );
}
