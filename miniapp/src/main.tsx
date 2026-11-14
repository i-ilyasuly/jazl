import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, Outlet, RouterProvider, ScrollRestoration, useLocation } from "react-router-dom";
import "./styles/base.css";
import { initTelegram } from "./telegram";
import { Home } from "./screens/Home";
import { OfferPage } from "./screens/Offer";
import { Paid, Success } from "./screens/Success";
import { Packs } from "./screens/Packs";
import { PackPage } from "./screens/PackPage";
import { Scan } from "./screens/Scan";
import { Profile } from "./screens/Profile";
import { Savings } from "./screens/Savings";
import { History } from "./screens/History";
import { Notifications } from "./screens/Notifications";
import { Receipt } from "./screens/Receipt";
import { Security } from "./screens/Security";
import { City, Language } from "./screens/Choice";
import { Stub } from "./screens/Stub";
import { NavBar, type TabKey } from "./ui/NavBar";

const tabOf: Record<string, TabKey> = { "/": "home", "/packs": "packs", "/profile": "profile" };

initTelegram();

// Навигация бір рет қана орнатылады: бет ауысқанда қайта салынбайды, сондықтан
// белсенді «тамшы» бір табтан екіншісіне сырғып өтеді.
function Shell() {
  const tab = tabOf[useLocation().pathname];
  return (
    <div className="app">
      <Outlet />
      {tab && <NavBar active={tab} />}
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
      { path: "/profile", element: <Profile /> },
      { path: "/profile/savings", element: <Savings /> },
      { path: "/profile/history", element: <History /> },
      { path: "/profile/notifications", element: <Notifications /> },
      { path: "/profile/receipt/:id", element: <Receipt /> },
      { path: "/profile/security", element: <Security /> },
      { path: "/profile/language", element: <Language /> },
      { path: "/profile/city", element: <City /> },
      { path: "*", element: <Stub /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
