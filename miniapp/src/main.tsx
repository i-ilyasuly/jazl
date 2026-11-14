import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, Outlet, RouterProvider, ScrollRestoration } from "react-router-dom";
import "./styles/base.css";
import { initTelegram } from "./telegram";
import { Home } from "./screens/Home";
import { OfferPage } from "./screens/Offer";
import { Success } from "./screens/Success";
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
      { path: "*", element: <Stub /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
