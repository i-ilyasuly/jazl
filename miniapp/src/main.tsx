import { StrictMode, Suspense, lazy, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, Navigate, Outlet, RouterProvider, ScrollRestoration, useLocation } from "react-router-dom";
import { loadCards, loadWaits, syncServerLang, useLocked, useOnboarded } from "./store";
import { Welcome, WelcomeCity, WelcomeLang, WelcomeTerms } from "./screens/Welcome";
import "./styles/base.css";
import { initTelegram } from "./telegram";
import { Home } from "./screens/Home";
import { OfferPage } from "./screens/Offer";
import { Packs } from "./screens/Packs";
import { PackPage } from "./screens/PackPage";
import { Profile } from "./screens/Profile";
import { Pin } from "./screens/Pin";
import { OfflineBar } from "./ui/OfflineBar";
import { Toast } from "./ui/Toast";
// Medeo Басқару — бөлек жүктелетін бөлік; нативті сборкада (VITE_NO_ADMIN=1) мүлде жоқ
const NO_ADMIN = import.meta.env.VITE_NO_ADMIN === "1";
const AdminApp = NO_ADMIN ? null : lazy(() => import("./admin/App"));
const ANavHost = NO_ADMIN ? null : lazy(() => import("./admin/ui").then((m) => ({ default: m.ANavHost })));
import { loadStaff } from "./venue/api";
import { NavBar, type TabKey } from "./ui/NavBar";
import { warmImages } from "./ui/imageCache";
import { EdgeBack } from "./ui/EdgeBack";
import { loadCatalog } from "./catalog";
import { warmBackground, onWifi, slowNet } from "./warm";
import { syncServerPacks } from "./store";

// Алғашқы ашылу жылдамдығы (Патша, 2026-11-18, видео: ~6.5 с): клиент бірден көретін экрандар (Басты, Ұсыныс, Пакеттер, Профиль, Тіркелу)
// негізгі файлда қалады; қалған беттер мен бүкіл мекеме бөлімі — бөлек файлдар, ашылғанда (не бос уақытта алдын ала) жүктеледі.
const pageLoaders: (() => Promise<unknown>)[] = [];
function lz<M extends Record<string, unknown>>(load: () => Promise<M>, venue = false) {
  if (!venue) pageLoaders.push(load);
  return (name: keyof M & string) => lazy(() => load().then((m) => ({ default: m[name] as ComponentType<any> })));
}
const _screens_Bonus = lz(() => import("./screens/Bonus"));
const Bonus = _screens_Bonus("Bonus");
const _screens_Success = lz(() => import("./screens/Success"));
const Paid = _screens_Success("Paid"), Success = _screens_Success("Success");
const _screens_Rebuy = lz(() => import("./screens/Rebuy"));
const CarryRules = _screens_Rebuy("CarryRules"), Rebuy = _screens_Rebuy("Rebuy"), RebuyDone = _screens_Rebuy("RebuyDone");
const _screens_GiftSend = lz(() => import("./screens/GiftSend"));
const GiftSend = _screens_GiftSend("GiftSend");
const _screens_UsageHistory = lz(() => import("./screens/UsageHistory"));
const UsageHistory = _screens_UsageHistory("UsageHistory");
const _screens_GiftOpen = lz(() => import("./screens/GiftOpen"));
const GiftDone = _screens_GiftOpen("GiftDone"), GiftOpen = _screens_GiftOpen("GiftOpen");
const _screens_Scan = lz(() => import("./screens/Scan"));
const Scan = _screens_Scan("Scan");
const _screens_ScanState = lz(() => import("./screens/ScanState"));
const ScanState = _screens_ScanState("ScanState");
const _screens_Savings = lz(() => import("./screens/Savings"));
const Savings = _screens_Savings("Savings");
const _screens_History = lz(() => import("./screens/History"));
const History = _screens_History("History");
const _screens_Notifications = lz(() => import("./screens/Notifications"));
const Notifications = _screens_Notifications("Notifications");
const _screens_Receipt = lz(() => import("./screens/Receipt"));
const Receipt = _screens_Receipt("Receipt"), OrderReceipt = _screens_Receipt("OrderReceipt"), UseReceipt = _screens_Receipt("UseReceipt");
const _screens_PayResult = lz(() => import("./screens/PayResult"));
const PayResult = _screens_PayResult("PayResult");
const _screens_CardAdd = lz(() => import("./screens/CardAdd"));
const CardAdd = _screens_CardAdd("CardAdd");
const _screens_Order = lz(() => import("./screens/Order"));
const Order = _screens_Order("Order");
const _screens_OrderResult = lz(() => import("./screens/OrderResult"));
const OrderDone = _screens_OrderResult("OrderDone"), OrderState = _screens_OrderResult("OrderState"), OrderView = _screens_OrderResult("OrderView");
const _screens_HapticTest = lz(() => import("./screens/HapticTest"));
const HapticTest = _screens_HapticTest("HapticTest");
const _screens_FontTest = lz(() => import("./screens/FontTest"));
const FontTest = _screens_FontTest("FontTest");
const _screens_SystemStatus = lz(() => import("./screens/SystemStatus"));
const SystemStatus = _screens_SystemStatus("SystemStatus");
const _screens_ServerReceipt = lz(() => import("./screens/ServerReceipt"));
const ServerReceipt = _screens_ServerReceipt("ServerReceipt");
const _screens_Security = lz(() => import("./screens/Security"));
const Security = _screens_Security("Security");
const _screens_Choice = lz(() => import("./screens/Choice"));
const City = _screens_Choice("City"), Language = _screens_Choice("Language");
const _screens_Favorites = lz(() => import("./screens/Favorites"));
const Favorites = _screens_Favorites("Favorites");
const _screens_Payment = lz(() => import("./screens/Payment"));
const Payment = _screens_Payment("Payment");
const _screens_Pay3ds = lz(() => import("./screens/Pay3ds"));
const Pay3ds = _screens_Pay3ds("Pay3ds");
const _screens_Gifts = lz(() => import("./screens/Gifts"));
const Gifts = _screens_Gifts("Gifts");
const _screens_AppError = lz(() => import("./screens/AppError"));
const AppError = _screens_AppError("AppError");
const _screens_Extra = lz(() => import("./screens/Extra"));
const CodeEntry = _screens_Extra("CodeEntry"), Complaint = _screens_Extra("Complaint"), ComplaintDone = _screens_Extra("ComplaintDone");
const _screens_Booking = lz(() => import("./screens/Booking"));
const BookConfirm = _screens_Booking("BookConfirm"), BookDone = _screens_Booking("BookDone"), BookingView = _screens_Booking("BookingView"), BookMissed = _screens_Booking("BookMissed"), BookMove = _screens_Booking("BookMove"), BookTime = _screens_Booking("BookTime");
const _screens_Help = lz(() => import("./screens/Help"));
const About = _screens_Help("About"), DeleteData = _screens_Help("DeleteData"), Faq = _screens_Help("Faq");
const _screens_Terms = lz(() => import("./screens/Terms"));
const Terms = _screens_Terms("Terms");
const _screens_VenueApply = lz(() => import("./screens/VenueApply"));
const VenueApply = _screens_VenueApply("VenueApply"), VenueDone = _screens_VenueApply("VenueDone");
const _screens_Report = lz(() => import("./screens/Report"));
const Report = _screens_Report("Report"), ReportDone = _screens_Report("ReportDone");
const _screens_Gift = lz(() => import("./screens/Gift"));
const Gift = _screens_Gift("Gift");
const _screens_Search = lz(() => import("./screens/Search"));
const Search = _screens_Search("Search");
const _screens_Category = lz(() => import("./screens/Category"));
const Category = _screens_Category("Category");
const _screens_MapScreen = lz(() => import("./screens/MapScreen"));
const MapScreen = _screens_MapScreen("MapScreen");
const _screens_VenuePage = lz(() => import("./screens/VenuePage"));
const VenuePage = _screens_VenuePage("VenuePage");
const _screens_Stub = lz(() => import("./screens/Stub"));
const Stub = _screens_Stub("Stub");
const _venue_ui = lz(() => import("./venue/ui"), true);
const VNavHost = _venue_ui("VNavHost");
const _venue_Entry = lz(() => import("./venue/Entry"), true);
const VGate = _venue_Entry("VGate"), VJoin = _venue_Entry("VJoin"), VPending = _venue_Entry("VPending"), VPickVenue = _venue_Entry("VPickVenue"), VWelcome = _venue_Entry("VWelcome");
const _venue_Home = lz(() => import("./venue/Home"), true);
const VCashier = _venue_Home("VCashier"), VHome = _venue_Home("VHome");
const _venue_Pay = lz(() => import("./venue/Pay"), true);
const VPaid = _venue_Pay("VPaid"), VPay = _venue_Pay("VPay"), VQr = _venue_Pay("VQr");
const _venue_History = lz(() => import("./venue/History"), true);
const VHistory = _venue_History("VHistory"), VOrder = _venue_History("VOrder"), VOrders = _venue_History("VOrders"), VRefunded = _venue_History("VRefunded");
const _venue_Manage = lz(() => import("./venue/Manage"), true);
const VMenu = _venue_Manage("VMenu"), VOffers = _venue_Manage("VOffers"), VReport = _venue_Manage("VReport");
const _venue_Team = lz(() => import("./venue/Team"), true);
const VInvite = _venue_Team("VInvite"), VStaff = _venue_Team("VStaff"), VTeam = _venue_Team("VTeam");
const _venue_Offers = lz(() => import("./venue/Offers"), true);
const VOfferPage = _venue_Offers("VOfferPage"), VOfferReview = _venue_Offers("VOfferReview"), VOfferWizard = _venue_Offers("VOfferWizard");
const _venue_Branches = lz(() => import("./venue/Branches"), true);
const VBranchEdit = _venue_Branches("VBranchEdit"), VBranches = _venue_Branches("VBranches");
const _venue_Reviews = lz(() => import("./venue/Reviews"), true);
const VReviews = _venue_Reviews("VReviews");
const _venue_Settings = lz(() => import("./venue/Settings"), true);
const VGuide = _venue_Settings("VGuide"), VProfile = _venue_Settings("VProfile"), VSettings = _venue_Settings("VSettings"), VSupport = _venue_Settings("VSupport");
const _venue_Apply = lz(() => import("./venue/Apply"), true);
const VApplyIntro = _venue_Apply("VApplyIntro"), VApplyStatus = _venue_Apply("VApplyStatus"), VApplyStep = _venue_Apply("VApplyStep"), VApplyTerms = _venue_Apply("VApplyTerms");
const _venue_Complaints = lz(() => import("./venue/Complaints"), true);
const VComplaint = _venue_Complaints("VComplaint"), VComplaints = _venue_Complaints("VComplaints"), VExpired = _venue_Complaints("VExpired");
const _venue_States = lz(() => import("./venue/States"), true);
const VAchievement = _venue_States("VAchievement");
const _screens_Kyc = lz(() => import("./screens/Kyc"));
const Doc = _screens_Kyc("Doc"), Kyc = _screens_Kyc("Kyc");

const tabOf: Record<string, TabKey> = { "/": "home", "/packs": "packs", "/profile": "profile" };

initTelegram();
// Бот сілтемелері t.me/Mmedeo_bot?startapp=<түр>_<id> түрінде келеді — бірден тиісті бетті ашамыз.
{
  const sp = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
  // Бот хабарламаларының батырмалары (backend/src/notify.ts): vo_ — тапсырыс, vc_ — шағым, pk_ — клиент пакеті, v_<бет> — мекеме беті
  const m = sp?.match(/^(gift|venue|offer|rc|staff|vo|vc|pk|v|a|pay|p)_([\w-]+)$/);
  const vPage: Record<string, string> = { home: "/v", report: "/v/report", team: "/v/team", reviews: "/v/reviews", apply: "/v/apply/status", complaints: "/v/complaints", new: "/v/apply", offers: "/v/offers" }; // new — бот /business: тіркелуді бастау
  const to = m && (m[1] === "a" ? "/a" : m[1] === "pay" ? `/pay/3ds/${m[2]}?wait=1` : m[1] === "v" ? vPage[m[2]] : m[1] === "p" ? ({ bonus: "/profile/bonus", savings: "/profile/savings", packs: "/packs", help: "/profile/faq", report: "/profile/report", lang: "/profile/language", home: "/" } as Record<string, string>)[m[2]] : ({ gift: "/gift/open/", venue: "/venue/", offer: "/offer/", rc: "/receipt/no/", staff: "/v/join/", vo: "/v/orders/", vc: "/v/complaints/", pk: "/pack/" } as Record<string, string>)[m[1]] + m[2]);
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
      <Suspense fallback={null}><FirstVisit key={path}><Outlet /></FirstVisit></Suspense>
      {tab && <NavBar active={tab} />}
      {path.startsWith("/v/") && <Suspense fallback={null}><VNavHost path={path} /></Suspense>}
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

// Суреттерді алдын ала жылыту, қалған беттерді алдын ала жүктеу — алғашқы экран салынып болған соң, бос уақытта
// (бұрын бірден басталып, шрифт пен негізгі файлмен желі үшін таласатын).
const idle = (cb: () => void, ms: number) => ("requestIdleCallback" in window ? window.requestIdleCallback(cb, { timeout: ms }) : setTimeout(cb, ms));
// main.tsx boot.ts-тен кейін (тіл дайын болған соң) жүктеледі — сол кезде бет «load» оқиғасы өтіп кеткен болуы мүмкін.
// Бұрын осы себепті фондық жүктеу мен service worker кейде мүлдем іске қосылмайтын (2026-11-21).
const afterLoad = (cb: () => void) => (document.readyState === "complete" ? cb() : window.addEventListener("load", cb, { once: true }));
afterLoad(() => {
  idle(warmImages, 1200);
  setTimeout(() => idle(() => { for (const load of pageLoaders) void load().catch(() => undefined); }, 3000), 1500);
  setTimeout(() => idle(warmBackground, 4000), 4000); // карта бағдарламасы, стикерлер, фотолар — беттерден кейін
});
// Өнімділік (Патша, 2026-11-21): бет айналып жатқанда <html>-ге .scrolling класы — қымбат әсерлер (шынының сынуы) уақытша өшеді
{ let t: number | undefined; addEventListener("scroll", () => { const r = document.documentElement; if (!r.classList.contains("scrolling")) { r.classList.add("scrolling"); dispatchEvent(new Event("medeo:scroll-start")); } clearTimeout(t); t = window.setTimeout(() => { r.classList.remove("scrolling"); dispatchEvent(new Event("medeo:scroll-end")); }, 180); }, { passive: true, capture: true }); }
// B1: каталог серверден фонда жүктеледі; келгенде беттер жаңа деректермен қайта салынады (күтпейміз)
void loadCatalog().then(() => window.dispatchEvent(new Event("medeo:catalog")));
void syncServerPacks(); // B2: басқа құрылғыда сатып алынған пакеттер
void loadStaff();
void loadCards(); syncServerLang(); idle(() => void loadWaits(), 4000); // «Хабарла» тізімі // сақталған карталар (сервер болса) // C2: мекеме қызметкері болса — Профильде «Мекеме бөлімі»
// Патша (2026-11-21): карта кэші — service worker; Қарағанды картасы фонда бір рет алдын ала жүктеледі (тек Wi-Fi/жақсы желіде)
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  afterLoad(() => {
    navigator.serviceWorker.register("./sw.js").then(() => {
      if (slowNet()) return;
      // v2: қаріптер мен белгішелер де жүктеледі; Wi-Fi-да — көше деңгейі (z15–16, карта көзі берсе)
      const wifi = onWifi();
      let done = false; try { done = localStorage.getItem(wifi ? "medeo_map_pref2w" : "medeo_map_pref2") === "1"; } catch { /* жеке терезе */ }
      if (done) return;
      window.setTimeout(() => {
        void navigator.serviceWorker.ready.then((r) => r.active?.postMessage({ type: "prefetch-map", styles: ["https://tiles.openfreemap.org/styles/liberty", "https://tiles.openfreemap.org/styles/dark"], bbox: [72.95, 49.74, 73.25, 49.9], deep: wifi }));
        try { localStorage.setItem("medeo_map_pref2", "1"); if (wifi) localStorage.setItem("medeo_map_pref2w", "1"); } catch { /* */ }
      }, 8000);
    }).catch(() => {});
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
