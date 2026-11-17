// Jazl+ Басқару маршруттары — бөлек бөлік (chunk): клиент пен мекеме оны ешқашан жүктемейді, тек /a ашылғанда жүктеледі.
// Нативті қосымша сборкасында (VITE_NO_ADMIN=1) бұл файл бандлға мүлде кірмейді — Басқару тек веб арқылы (Патша, 2026-11-17).
import { Route, Routes } from "react-router-dom";
import { AGate, APin } from "./Entry";
import { AAttention, APulse } from "./Pulse";
import { AApp, AAppDone, AApps, ABranches, ANotes, ATeam, AVenue, AVenues } from "./Venues";
import { AOffer, AOffers } from "./Offers";
import { AComplaint, AComplaintSent, AComplaints } from "./Complaints";
import { APack, APacks } from "./Packs";
import { ALog, AMoney, AMore, ARules } from "./More";

export default function AdminApp() {
  return (
    <Routes>
      <Route index element={<AGate />} />
      <Route path="pin" element={<APin />} />
      <Route path="pin/setup" element={<APin setup />} />
      <Route path="pulse" element={<APulse />} />
      <Route path="attention" element={<AAttention />} />
      <Route path="venues" element={<AVenues />} />
      <Route path="venues/:id" element={<AVenue />} />
      <Route path="venues/:id/notes" element={<ANotes />} />
      <Route path="venues/:id/branches" element={<ABranches />} />
      <Route path="venues/:id/team" element={<ATeam />} />
      <Route path="apps" element={<AApps />} />
      <Route path="apps/:id" element={<AApp />} />
      <Route path="apps/:id/done" element={<AAppDone />} />
      <Route path="offers" element={<AOffers />} />
      <Route path="offers/:id" element={<AOffer />} />
      <Route path="packs" element={<APacks />} />
      <Route path="packs/:id" element={<APack />} />
      <Route path="money" element={<AMoney />} />
      <Route path="complaints" element={<AComplaints />} />
      <Route path="complaints/:id" element={<AComplaint />} />
      <Route path="complaints/:id/sent" element={<AComplaintSent />} />
      <Route path="more" element={<AMore />} />
      <Route path="rules" element={<ARules />} />
      <Route path="log" element={<ALog />} />
    </Routes>
  );
}
