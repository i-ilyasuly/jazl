import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Route, Routes } from "react-router-dom";
import "./styles/base.css";
import { initTelegram } from "./telegram";
import { Home } from "./screens/Home";
import { OfferPage } from "./screens/Offer";
import { Stub } from "./screens/Stub";

initTelegram();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <div className="app">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/offer/:id" element={<OfferPage />} />
          <Route path="*" element={<Stub />} />
        </Routes>
      </div>
    </HashRouter>
  </StrictMode>,
);
