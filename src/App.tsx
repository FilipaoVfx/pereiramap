import { Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Capture from "./pages/Capture";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/capture" element={<Capture />} />
    </Routes>
  );
}
