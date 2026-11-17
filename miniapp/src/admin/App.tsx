// Jazl+ Басқару маршруттары — бөлек бөлік (chunk): клиент пен мекеме оны ешқашан жүктемейді, тек /a ашылғанда жүктеледі.
// Нативті қосымша сборкасында (VITE_NO_ADMIN=1) бұл файл бандлға мүлде кірмейді — Басқару тек веб арқылы (Патша, 2026-11-17).
import type { ReactElement } from "react";
import { Route, Routes } from "react-router-dom";
import { Split, useDesk } from "./Desk";
import { AGate, APin } from "./Entry";
import { AAttention, APulse } from "./Pulse";
import { AApp, AAppDone, AApps, ABranches, ANotes, ATeam, AVenue, AVenues } from "./Venues";
import { AOffer, AOffers } from "./Offers";
import { AComplaint, AComplaintSent, AComplaints } from "./Complaints";
import { APack, APacks } from "./Packs";
import { ALog, AMoney, AMore, ARules } from "./More";
import { ANotifications } from "./Notifications";
import { APayments, ARefunds, ASettlements } from "./Money";

export default function AdminApp() {
  const desk = useDesk();
  // Кең экранда тізім мен таңдалған жазба қатар тұрады (Figma 22): /a/venues/:id → тізім + мекеме панелі
  const sp = (list: ReactElement, detail?: ReactElement, empty?: string) => (desk ? <Split list={list} detail={detail} empty={empty} /> : detail ?? list);
  return (
    <Routes>
      <Route index element={<AGate />} />
      <Route path="pin" element={<APin />} />
      <Route path="pin/setup" element={<APin setup />} />
      <Route path="pulse" element={<APulse />} />
      <Route path="attention" element={<AAttention />} />
      <Route path="venues" element={sp(<AVenues />, undefined, "Мекемені таңдаңыз")} />
      <Route path="venues/:id" element={sp(<AVenues />, <AVenue />)} />
      <Route path="venues/:id/notes" element={<ANotes />} />
      <Route path="venues/:id/branches" element={<ABranches />} />
      <Route path="venues/:id/team" element={<ATeam />} />
      <Route path="apps" element={sp(<AApps />, undefined, "Өтінімді таңдаңыз")} />
      <Route path="apps/:id" element={sp(<AApps />, <AApp />)} />
      <Route path="apps/:id/done" element={<AAppDone />} />
      <Route path="offers" element={sp(<AOffers />, undefined, "Ұсынысты таңдаңыз")} />
      <Route path="offers/:id" element={sp(<AOffers />, <AOffer />)} />
      <Route path="packs" element={sp(<APacks />, undefined, "Пакетті таңдаңыз")} />
      <Route path="packs/:id" element={sp(<APacks />, <APack />)} />
      <Route path="money" element={<AMoney />} />
      <Route path="complaints" element={<AComplaints />} />
      <Route path="complaints/:id" element={desk ? sp(<AComplaints />, <AComplaint />) : <AComplaint />} />
      <Route path="complaints/:id/sent" element={<AComplaintSent />} />
      <Route path="more" element={<AMore />} />
      <Route path="rules" element={<ARules />} />
      <Route path="log" element={<ALog />} />
      <Route path="notifications" element={<ANotifications />} />
      <Route path="money/payments" element={<APayments />} />
      <Route path="money/settlements" element={<ASettlements />} />
      <Route path="money/refunds" element={<ARefunds />} />
    </Routes>
  );
}
