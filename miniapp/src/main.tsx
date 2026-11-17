import { StrictMode, Suspense, lazy, useEffect, useRef, useState, type ReactNode } from "react";
import { Bonus } from "./screens/Bonus";
import { createRoot } from "react-dom/client";
import { createHashRouter, Navigate, Outlet, RouterProvider, ScrollRestoration, useLocation } from "react-router-dom";
import { loadCards, useLocked, useOnboarded } from "./store";
import { Welcome, WelcomeCity, WelcomeLang, WelcomeTerms } from "./screens/Welcome";
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
import { ServerReceipt } from "./screens/ServerReceipt";
import { Security } from "./screens/Security";
import { City, Language } from "./screens/Choice";
import { Favorites } from "./screens/Favorites";
import { Payment } from "./screens/Payment";
import { Pay3ds } from "./screens/Pay3ds";
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
import { VNavHost } from "./venue/ui";
// Medeo Басқару — бөлек жүктелетін бөлік; нативті сборкада (VITE_NO_ADMIN=1) мүлде жоқ
const NO_ADMIN = import.meta.env.VITE_NO_ADMIN === "1";
const AdminApp = NO_ADMIN ? null : lazy(() => import("./admin/App"));
const ANavHost = NO_ADMIN ? null : lazy(() => import("./admin/ui").then((m) => ({ default: m.ANavHost })));
import { VGate, VJoin, VPending, VPickVenue, VWelcome } from "./venue/Entry";
import { VCashier, VHome } from "./venue/Home";
import { VPaid, VPay, VQr } from "./venue/Pay";
import { VHistory, VOrder, VOrders, VRefunded } from "./venue/History";
import { VMenu, VOffers, VReport } from "./venue/Manage";
import { VInvite, VStaff, VTeam } from "./venue/Team";
import { VOfferPage, VOfferReview, VOfferWizard } from "./venue/Offers";
import { VBranchEdit, VBranches } from "./venue/Branches";
import { VReviews } from "./venue/Reviews";
import { VGuide, VProfile, VSettings, VSupport } from "./venue/Settings";
import { VApplyIntro, VApplyStatus, VApplyStep, VApplyTerms } from "./venue/Apply";
import { VComplaint, VComplaints, VExpired } from "./venue/Complaints";
import { VAchievement } from "./venue/States";
import { loadStaff } from "./venue/api";
import { Doc, Kyc } from "./screens/Kyc";
import { NavBar, type TabKey } from "./ui/NavBar";
import { warmImages } from "./ui/imageCache";
import { EdgeBack } from "./ui/EdgeBack";
import { loadCatalog } from "./catalog";
import { syncServerPacks } from "./store";

const tabOf: Record<string, TabKey> = { "/": "home", "/packs": "packs", "/profile": "profile" };

initTelegram();
// Бот сілтемелері t.me/Mmedeo_bot?startapp=<түр>_<id> түрінде келеді — бірден тиісті бетті ашамыз.
{
  const sp = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
  // Бот хабарламаларының батырмалары (backend/src/notify.ts): vo_ — тапсырыс, vc_ — шағым, pk_ — клиент пакеті, v_<бет> — мекеме беті
  const m = sp?.match(/^(gift|venue|offer|rc|staff|vo|vc|pk|v|a|pay|p)_([\w-]+)$/);
  const vPage: Record<string, string> = { home: "/v", report: "/v/report", team: "/v/team", reviews: "/v/reviews", apply: "/v/apply/status", complaints: "/v/complaints" };
  const to = m && (m[1] === "a" ? "/a" : m[1] === "pay" ? `/pay/3ds/${m[2]}?wait=1` : m[1] === "v" ? vPage[m[2]] : m[1] === "p" ? ({ bonus: "/profile/bonus" } as Record<string, string>)[m[2]] : ({ gift: "/gift/open/", venue: "/venue/", offer: "/offer/", rc: "/receipt/no/", staff: "/v/join/", vo: "/v/orders/", vc: "/v/complaints/", pk: "/pack/" } as Record<string, string>)[m[1]] + m[2]);
  if (m && to) window.location.hash = "#" + to;
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
  useEffect(() => { const on = () => setCatalogTick((n) => n + 1); window.addEventListener("medeo:catalog", on); return () => window.removeEventListener("medeo:catalog", on); }, []);
  const tab = tabOf[path] ?? (path.startsWith("/category/") ? "home" : undefined);
  const onboarded = useOnboarded();
  const locked = useLocked();
  // Патша (2026-11-17): «Medeo» жүктелу экраны алынды — баптаулар оқылғанша (CloudStorage, ~50–200 мс) бос фон ғана
  if (onboarded === null) return <div className="app" />;
  if (!onboarded && !path.startsWith("/welcome") && !path.startsWith("/v/") && path !== "/v" && !path.startsWith("/a") && !path.startsWith("/legal")) return <Navigate to="/welcome" replace />;
  return (
    <div className="app">
      <FirstVisit key={path}><Outlet /></FirstVisit>
      {tab && <NavBar active={tab} />}
      {path.startsWith("/v/") && <VNavHost path={path} />}
      {ANavHost && path.startsWith("/a/") && <Suspense fallback={null}><ANavHost path={path} /></Suspense>}
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
      { path: "/pay/3ds/:id", element: <Pay3ds /> },
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
      { path: "/receipt/srv/:id", element: <ServerReceipt /> },
      { path: "/receipt/no/:no", element: <ServerReceipt /> },
      { path: "/profile/language", element: <Language /> },
      { path: "/profile/city", element: <City /> },
      { path: "/profile/favorites", element: <Favorites /> },
      { path: "/profile/payment", element: <Payment /> },
      { path: "/profile/bonus", element: <Bonus /> },
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
      { path: "/legal", element: <Terms /> }, // ашық: тіркелусіз (төлем провайдері сайтты тексергенде)
      { path: "/legal/:id", element: <Doc /> },
      { path: "/kyc", element: <Kyc /> },
      { path: "/profile/venue", element: <Navigate to="/v/apply" replace /> }, // ескі қысқа өтінім → Figma «02 · Тіркелу»
      { path: "/profile/venue/done", element: <VenueDone /> },
      { path: "/profile/report", element: <Report /> },
      { path: "/profile/faq", element: <Faq /> },
      { path: "/error/:kind", element: <AppError /> },
      { path: "/profile/about", element: <About /> },
      { path: "/profile/delete", element: <DeleteData /> },
      { path: "/profile/report/done", element: <ReportDone /> },
      // Мекеме бөлімі — Figma «Medeo Мекеме»
      { path: "/v", element: <VGate /> },
      // Medeo Басқару (Figma 14060:7998)
      { path: "/a/*", element: AdminApp ? <Suspense fallback={<div className="app" />}><AdminApp /></Suspense> : <Navigate to="/profile" replace /> },
      { path: "/v/welcome", element: <VWelcome /> },
      { path: "/v/apply", element: <VApplyIntro /> },
      { path: "/v/apply/terms", element: <VApplyTerms /> },
      { path: "/v/apply/status", element: <VApplyStatus /> },
      { path: "/v/apply/:step", element: <VApplyStep /> },
      { path: "/v/join", element: <VJoin /> },
      { path: "/v/join/:code", element: <VJoin /> },
      { path: "/v/pending", element: <VPending /> },
      { path: "/v/pick", element: <VPickVenue /> },
      { path: "/v/home", element: <VHome /> },
      { path: "/v/cashier", element: <VCashier /> },
      { path: "/v/pay", element: <VPay /> },
      { path: "/v/pay/qr/:id", element: <VQr /> },
      { path: "/v/pay/done/:id", element: <VPaid /> },
      { path: "/v/history", element: <VHistory /> },
      { path: "/v/refunded/:n", element: <VRefunded /> },
      { path: "/v/orders", element: <VOrders /> },
      { path: "/v/orders/:id", element: <VOrder /> },
      { path: "/v/offers", element: <VOffers /> },
      { path: "/v/offers/new", element: <VOfferWizard /> },
      { path: "/v/offers/review", element: <VOfferReview /> },
      { path: "/v/offers/:id", element: <VOfferPage /> },
      { path: "/v/offers/:id/edit", element: <VOfferWizard /> },
      { path: "/v/report", element: <VReport /> },
      { path: "/v/menu", element: <VMenu /> },
      { path: "/v/branches", element: <VBranches /> },
      { path: "/v/reviews", element: <VReviews /> },
      { path: "/v/complaints", element: <VComplaints /> },
      { path: "/v/complaints/:id", element: <VComplaint /> },
      { path: "/v/expired", element: <VExpired /> },
      { path: "/v/achieve/:kind", element: <VAchievement /> },
      { path: "/v/profile", element: <VProfile /> },
      { path: "/v/settings", element: <VSettings /> },
      { path: "/v/support", element: <VSupport /> },
      { path: "/v/guide", element: <VGuide /> },
      { path: "/v/branches/:id", element: <VBranchEdit /> },
      { path: "/v/team", element: <VTeam /> },
      { path: "/v/team/invite", element: <VInvite /> },
      { path: "/v/team/:uid", element: <VStaff /> },
      { path: "*", element: <Stub /> },
    ],
  },
]);

warmImages();
// B1: каталог серверден фонда жүктеледі; келгенде беттер жаңа деректермен қайта салынады (күтпейміз)
void loadCatalog().then(() => window.dispatchEvent(new Event("medeo:catalog")));
void syncServerPacks(); // B2: басқа құрылғыда сатып алынған пакеттер
void loadStaff();
void loadCards(); // сақталған карталар (сервер болса) // C2: мекеме қызметкері болса — Профильде «Мекеме бөлімі»
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
