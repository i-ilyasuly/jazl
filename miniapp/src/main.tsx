import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, Navigate, Outlet, RouterProvider, ScrollRestoration, useLocation } from "react-router-dom";
import { useOnboarded } from "./store";
import { Splash, Welcome, WelcomeCity, WelcomeLang, WelcomeTerms } from "./screens/Welcome";
import "./styles/base.css";
import { initTelegram } from "./telegram";
import { Home } from "./screens/Home";
import { OfferPage } from "./screens/Offer";
import { Paid, Success } from "./screens/Success";
import { Packs } from "./screens/Packs";
import { PackPage } from "./screens/PackPage";
import { CarryRules, Rebuy, RebuyDone } from "./screens/Rebuy";
import { Scan } from "./screens/Scan";
import { ScanState } from "./screens/ScanState";
import { Profile } from "./screens/Profile";
import { Savings } from "./screens/Savings";
import { History } from "./screens/History";
import { Notifications } from "./screens/Notifications";
import { Receipt, UseReceipt } from "./screens/Receipt";
import { PayResult } from "./screens/PayResult";
import { CardAdd } from "./screens/CardAdd";
import { Order } from "./screens/Order";
import { OrderDone, OrderState, OrderView } from "./screens/OrderResult";
import { HapticTest } from "./screens/HapticTest";
import { Security } from "./screens/Security";
import { City, Language } from "./screens/Choice";
import { Favorites } from "./screens/Favorites";
import { Payment } from "./screens/Payment";
import { Gifts } from "./screens/Gifts";
import { Pin } from "./screens/Pin";
import { Terms } from "./screens/Terms";
import { VenueApply, VenueDone } from "./screens/VenueApply";
import { Report, ReportDone } from "./screens/Report";
import { Gift } from "./screens/Gift";
import { Search } from "./screens/Search";
import { Category } from "./screens/Category";
import { MapScreen } from "./screens/MapScreen";
import { VenuePage } from "./screens/VenuePage";
import { Stub } from "./screens/Stub";
import { NavBar, type TabKey } from "./ui/NavBar";

const tabOf: Record<string, TabKey> = { "/": "home", "/packs": "packs", "/profile": "profile" };

initTelegram();

// Навигация бір рет қана орнатылады: бет ауысқанда қайта салынбайды, сондықтан
// белсенді «тамшы» бір табтан екіншісіне сырғып өтеді.
function Shell() {
  const path = useLocation().pathname;
  const tab = tabOf[path] ?? (path.startsWith("/category/") ? "home" : undefined);
  const onboarded = useOnboarded();
  if (onboarded === null) return <div className="app"><Splash /></div>;
  if (!onboarded && !path.startsWith("/welcome")) return <Navigate to="/welcome" replace />;
  return (
    <div className="app">
      <Outlet />
      {tab && <NavBar active={tab} />}
      <ScrollRestoration />
    </div>
  );
}

// Қосалқы бейімдеу: егер орта «бет ені 412» баптауын елемесе (мысалы, тар терезелі компьютер),
// бүкіл қосымша терезе еніне пропорциямен кішірейтіледі.
function fit() {
  const w = window.innerWidth;
  const z = w < 411.5 ? w / 412 : 1;
  const root = document.documentElement;
  root.style.setProperty("zoom", z === 1 ? "" : String(z));
  if (z === 1) root.style.removeProperty("--app-h"); else root.style.setProperty("--app-h", window.innerHeight / z + "px");
  const phone = Math.min(screen.width, screen.height);
  const scaled = Math.abs(w - 412) < 1.5 && phone < 600; // «бет ені 412» баптауы қолданылған
  root.style.setProperty("--k", String(scaled ? 412 / phone : z !== 1 ? 1 / z : 1));
}
fit();
window.addEventListener("resize", fit);

const router = createHashRouter([
  {
    element: <Shell />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/offer/:id", element: <OfferPage /> },
      { path: "/success/:id", element: <Success /> },
      { path: "/pay/:kind/:id", element: <PayResult /> },
      { path: "/profile/card-add", element: <CardAdd /> },
      { path: "/order/:packId", element: <Order /> },
      { path: "/order/done/:id", element: <OrderDone /> },
      { path: "/order/state/:kind/:packId", element: <OrderState /> },
      { path: "/orders/:id", element: <OrderView /> },
      { path: "/packs", element: <Packs /> },
      { path: "/pack/:id", element: <PackPage /> },
      { path: "/rebuy/:id", element: <Rebuy /> },
      { path: "/rebuy/done/:id", element: <RebuyDone /> },
      { path: "/rules/carry", element: <CarryRules /> },
      { path: "/scan", element: <Scan /> },
      { path: "/scan/state/:kind", element: <ScanState /> },
      { path: "/receipt/use/:id", element: <UseReceipt /> },
      { path: "/paid/:id", element: <Paid /> },
      { path: "/profile", element: <Profile /> },
      { path: "/profile/savings", element: <Savings /> },
      { path: "/profile/history", element: <History /> },
      { path: "/profile/notifications", element: <Notifications /> },
      { path: "/profile/receipt/:id", element: <Receipt /> },
      { path: "/profile/security", element: <Security /> },
      { path: "/profile/haptics", element: <HapticTest /> },
      { path: "/profile/language", element: <Language /> },
      { path: "/profile/city", element: <City /> },
      { path: "/profile/favorites", element: <Favorites /> },
      { path: "/profile/payment", element: <Payment /> },
      { path: "/profile/gifts", element: <Gifts /> },
      { path: "/profile/pin/:mode", element: <Pin /> },
      { path: "/profile/terms", element: <Terms /> },
      { path: "/profile/gift/:id", element: <Gift /> },
      { path: "/search", element: <Search /> },
      { path: "/map", element: <MapScreen /> },
      { path: "/venue/:id", element: <VenuePage /> },
      { path: "/category/:kind", element: <Category /> },
      { path: "/welcome", element: <Welcome /> },
      { path: "/welcome/lang", element: <WelcomeLang /> },
      { path: "/welcome/city", element: <WelcomeCity /> },
      { path: "/welcome/terms", element: <WelcomeTerms /> },
      { path: "/welcome/doc/:id", element: <Stub /> },
      { path: "/profile/venue", element: <VenueApply /> },
      { path: "/profile/venue/done", element: <VenueDone /> },
      { path: "/profile/report", element: <Report /> },
      { path: "/profile/report/done", element: <ReportDone /> },
      { path: "*", element: <Stub /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
