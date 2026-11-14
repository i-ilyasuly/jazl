import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, Outlet, RouterProvider, ScrollRestoration } from "react-router-dom";
import "./styles/base.css";
import { initTelegram } from "./telegram";
import { Home } from "./screens/Home";
import { OfferPage } from "./screens/Offer";
import { Paid, Success } from "./screens/Success";
import { Packs } from "./screens/Packs";
import { PackPage } from "./screens/PackPage";
import { Scan } from "./screens/Scan";
import { Stub } from "./screens/Stub";

initTelegram();

function Shell() {
  return (
    <div className="app">
      <Outlet />
      <ScrollRestoration />
    </div>
  );
}

const router = createHashRouter([
  {
    element: <Shell />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/offer/:id", element: <OfferPage /> },
      { path: "/success/:id", element: <Success /> },
      { path: "/packs", element: <Packs /> },
      { path: "/pack/:id", element: <PackPage /> },
      { path: "/scan", element: <Scan /> },
      { path: "/paid/:id", element: <Paid /> },
      { path: "*", element: <Stub /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
