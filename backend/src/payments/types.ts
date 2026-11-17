// Төлем провайдерінің ортақ интерфейсі. Нақты провайдер (Halyk ePay, Freedom Pay, TipTop Pay…) осы интерфейсті жүзеге асырады,
// сатып алу логикасы (routes/purchases.ts) провайдерге тәуелсіз.
//
// ЕРЕЖЕ (PCI DSS): карта нөмірі, мерзімі, CVC біздің серверге ЕШҚАШАН келмейді. Клиент оларды мини апптағы форма арқылы енгізеді,
// бірақ форма оларды провайдердің JS-кітапханасымен шифрлап («криптограмма») не провайдердің қорғалған бетіне жібереді.
// Серверге тек криптограмма не провайдердің токені келеді.

/** Сақталған картаның көрінетін бөлігі (провайдер токенімен) */
export interface CardInfo { token: string; brand: string; last4: string; expMonth: number; expYear: number; holder?: string | null }

export interface ChargeInput {
  /** Біздегі төлем ID-і (провайдерге «тапсырыс нөмірі» ретінде) — вебхукта осы арқылы табамыз */
  paymentId: string;
  /** Теңгемен, бүтін сан */
  amount: number;
  /** Клиенттің банк қосымшасында көрінетін сипаттама: «Jazl+ · Тауық донері · 4 дана» */
  description: string;
  user: { id: string; telegramId: number };
  /** Сақталған картаның токені немесе бір реттік криптограмма (жаңа карта) */
  card: { token?: string; cryptogram?: string; save?: boolean };
  /** 3-D Secure біткен соң клиент оралатын мекенжай */
  returnUrl: string;
}

export type ChargeResult =
  /** Бірден өтті (3-D Secure керек болмады не токенмен) */
  | { status: "paid"; externalId: string; card?: CardInfo }
  /** Банк растауы керек: клиент confirmUrl-ды ашады; нәтиже вебхукпен (не confirm сұрауымен) келеді */
  | { status: "action_required"; externalId: string; confirmUrl: string }
  /** Өтпеді: себебі клиентке түсінікті мәтінге айналдырылады */
  | { status: "failed"; externalId?: string; reason: FailReason };

export type FailReason = "declined" | "insufficient_funds" | "expired_card" | "3ds_failed" | "limit" | "fraud" | "provider_error";

/** Вебхуктан алынған нәтиже: externalId не paymentId арқылы төлемді табамыз */
export interface WebhookEvent { paymentId?: string; externalId: string; status: "paid" | "failed"; reason?: FailReason; card?: CardInfo }

export interface PaymentProvider {
  /** payments.provider бағанына жазылады */
  readonly name: string;
  /** Төлем жасау (жаңа карта криптограммасы не сақталған карта токені) */
  charge(input: ChargeInput): Promise<ChargeResult>;
  /** Картаны сақтау (ақша алмай, токенге айналдыру): криптограмма → токен */
  tokenize(cryptogram: string, user: { id: string }): Promise<CardInfo>;
  /** Провайдердің вебхугын тексеру (қолтаңба!) және оқу. Жарамсыз болса — null */
  webhook(req: { headers: Record<string, string>; body: string }): Promise<WebhookEvent | null>;
  /** Қайтару (толық не жартылай). Ақшалай қайтару әзірге өшірулі — интерфейсте болашаққа */
  refund?(externalId: string, amount: number): Promise<{ ok: boolean; reason?: string }>;
}

export class PaymentError extends Error { constructor(public code: string) { super(code); } }
