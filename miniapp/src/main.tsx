import { StrictMode, useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, Navigate, Outlet, RouterProvider, ScrollRestoration, useLocation } from "react-router-dom";
import { useLocked, useOnboarded } from "./store";
import { Splash, Welcome, WelcomeCity, WelcomeLang, WelcomeTerms } from "./screens/Welcome";
import "./styles/base.css";
import { initTelegram } from "./telegram";
import { Home } from "./screens/Home";
import { OfferPage } from "./screens/Offer";
import { Paid, Success } from "./screens/Success";
import { Packs } from "./screens/Packs";
import { PackPage } from "./screens/PackPage";
import { CarryRules, Rebuy, RebuyDone } from "./screens/Rebuy";
import { GiftSend } from "./screens/GiftSend";
import { UsageHistory } from "./screens/UsageHistory";
import { GiftDone, GiftOpen } from "./screens/GiftOpen";
import { Scan } from "./screens/Scan";
import { ScanState } from "./screens/ScanState";
import { Profile } from "./screens/Profile";
import { Savings } from "./screens/Savings";
import { History } from "./screens/History";
import { Notifications } from "./screens/Notifications";
import { Receipt, OrderReceipt, UseReceipt } from "./screens/Receipt";
import { PayResult } from "./screens/PayResult";
import { CardAdd } from "./screens/CardAdd";
import { Order } from "./screens/Order";
import { OrderDone, OrderState, OrderView } from "./screens/OrderResult";
import { HapticTest } from "./screens/HapticTest";
import { FontTest } from "./screens/FontTest";
import { SystemStatus } from "./screens/SystemStatus";
import { Security } from "./screens/Security";
import { City, Language } from "./screens/Choice";
import { Favorites } from "./screens/Favorites";
import { Payment } from "./screens/Payment";
import { Gifts } from "./screens/Gifts";
import { Pin } from "./screens/Pin";
import { AppError } from "./screens/AppError";
import { CodeEntry, Complaint, ComplaintDone } from "./screens/Extra";
import { BookConfirm, BookDone, BookingView, BookMissed, BookMove, BookTime } from "./screens/Booking";
import { OfflineBar } from "./ui/OfflineBar";
import { Toast } from "./ui/Toast";
import { About, DeleteData, Faq } from "./screens/Help";
import { Terms } from "./screens/Terms";
import { VenueApply, VenueDone } from "./screens/VenueApply";
import { Report, ReportDone } from "./screens/Report";
import { Gift } from "./screens/Gift";
import { Search } from "./screens/Search";
import { Category } from "./screens/Category";
import { MapScreen } from "./screens/MapScreen";
import { VenuePage } from "./screens/VenuePage";
import { Stub } from "./screens/Stub";
import { Doc, Kyc } from "./screens/Kyc";
import { NavBar, type TabKey } from "./ui/NavBar";
import { warmImages } from "./ui/imageCache";
import { EdgeBack } from "./ui/EdgeBack";
import { loadCatalog } from "./catalog";

const tabOf: Record<string, TabKey> = { "/": "home", "/packs": "packs", "/profile": "profile" };

initTelegram();
// Бот сілтемелері t.me/oylarbot?startapp=<түр>_<id> түрінде келеді — бірден тиісті бетті ашамыз.
{
  const sp = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
  const m = sp?.match(/^(gift|venue|offer)_([\w-]+)$/);
  const to = m && { gift: "/gift/open/", venue: "/venue/", offer: "/offer/" }[m[1] as "gift" | "venue" | "offer"];
  if (m && to) window.location.hash = "#" + to + m[2];
}

// Кіру анимациялары тек бет қолданба ашылғаннан бері АЛҒАШ көрсетілгенде ойнайды (Патша, 2026-11-16: «құр шығын»).
// Қайта келгенде .still класы анимациялардың ұзақтығын нөлге теңейді — бәрі бірден соңғы күйінде тұрады;
// ауысу біткен соң (700 мс) класс алынады, анимация аты өзгермегендіктен ешнәрсе қайта ойнамайды, ал кейінгі әрекет анимациялары қалыпты.
const seenPaths = new Set<string>();
function FirstVisit({ children }: { children: ReactNode }) {
  const path = useLocation().pathname;
  const ref = useRef<HTMLDivElement>(null);
  const [still] = useState(() => { const seen = seenPaths.has(path); seenPaths.add(path); return seen; });
  useEffect(() => {
    if (!still) return;
    // Бет ауысуы (View Transition, ≤0.32 с) кезінде салу кідіреді — сондықтан ауысу біткен соң аламыз. Класты алған сәтте
    // (экранға шықпай тұрып) кіру анимацияларын соңғы күйіне жеткіземіз, әйтпесе ұзақтығы қайта қосылып, ортасынан ойнайды.
    const t = setTimeout(() => {
      const el = ref.current; if (!el) return;
      el.classList.remove("still");
      for (const an of el.getAnimations?.({ subtree: true }) ?? []) {
        if (an instanceof CSSAnimation && an.effect?.getTiming().iterations !== Infinity && an.playState !== "finished") an.finish();
      }
    }, 700);
    return () => clearTimeout(t);
  }, [still]);
  return <div ref={ref} className={still ? "still" : undefined} style={{ display: "contents" }}>{children}</div>;
}

// Навигация бір рет қана орнатылады: бет ауысқанда қайта салынбайды, сондықтан
// белсенді «тамшы» бір табтан екіншісіне сырғып өтеді.
function Shell() {
  const path = useLocation().pathname;
  const [, setCatalogTick] = useState(0);
  useEffect(() => { const on = () => setCatalogTick((n) => n + 1); window.addEventListener("jazl:catalog", on); return () => window.removeEventListener("jazl:catalog", on); }, []);
  const tab = tabOf[path] ?? (path.startsWith("/category/") ? "home" : undefined);
  const onboarded = useOnboarded();
  const locked = useLocked();
  if (onboarded === null) return <div className="app"><Splash /></div>;
  if (!onboarded && !path.startsWith("/welcome")) return <Navigate to="/welcome" replace />;
  return (
    <div className="app">
      <FirstVisit key={path}><Outlet /></FirstVisit>
      {tab && <NavBar active={tab} />}
      {tab && <OfflineBar />}
      {locked && <Pin lock />}
      <Toast />
      <EdgeBack />
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
      { path: "/gift/:id", element: <GiftSend /> },
      { path: "/profile/usage", element: <UsageHistory /> },
      { path: "/gift/open/:id", element: <GiftOpen /> },
      { path: "/gift/done/:id", element: <GiftDone /> },
      { path: "/scan", element: <Scan /> },
      { path: "/scan/state/:kind", element: <ScanState /> },
      { path: "/receipt/use/:id", element: <UseReceipt /> },
      { path: "/receipt/order/:id", element: <OrderReceipt /> },
      { path: "/book/:packId", element: <BookTime /> },
      { path: "/complaint/done", element: <ComplaintDone /> },
      { path: "/complaint/:packId", element: <Complaint /> },
      { path: "/scan/code", element: <CodeEntry /> },
      { path: "/book/:packId/confirm", element: <BookConfirm /> },
      { path: "/book/done/:id", element: <BookDone /> },
      { path: "/booking/missed/:packId", element: <BookMissed /> },
      { path: "/booking/:id", element: <BookingView /> },
      { path: "/booking/:id/move", element: <BookMove /> },
      { path: "/paid/:id", element: <Paid /> },
      { path: "/profile", element: <Profile /> },
      { path: "/profile/savings", element: <Savings /> },
      { path: "/profile/history", element: <History /> },
      { path: "/profile/notifications", element: <Notifications /> },
      { path: "/profile/receipt/:id", element: <Receipt /> },
      { path: "/profile/security", element: <Security /> },
      { path: "/profile/haptics", element: <HapticTest /> },
      { path: "/profile/fonts", element: <FontTest /> },
      { path: "/profile/system", element: <SystemStatus /> },
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
      { path: "/welcome/doc/:id", element: <Doc /> },
      { path: "/welcome/carry", element: <CarryRules /> }, // тіркелмеген адамға да ашылады (бұрын /welcome-ге қайта лақтыратын)
      { path: "/profile/doc/:id", element: <Doc /> },
      { path: "/kyc", element: <Kyc /> },
      { path: "/profile/venue", element: <VenueApply /> },
      { path: "/profile/venue/done", element: <VenueDone /> },
      { path: "/profile/report", element: <Report /> },
      { path: "/profile/faq", element: <Faq /> },
      { path: "/error/:kind", element: <AppError /> },
      { path: "/profile/about", element: <About /> },
      { path: "/profile/delete", element: <DeleteData /> },
      { path: "/profile/report/done", element: <ReportDone /> },
      { path: "*", element: <Stub /> },
    ],
  },
]);

warmImages();
// B1: каталог серверден фонда жүктеледі; келгенде беттер жаңа деректермен қайта салынады (күтпейміз)
void loadCatalog().then(() => window.dispatchEvent(new Event("jazl:catalog")));
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
