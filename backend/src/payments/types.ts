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
  /** Төлемнің сандық нөмірі (payments.no): тек сан қабылдайтын провайдерлерге (Halyk invoiceId) */
  orderNo?: number;
  /** Теңгемен, бүтін сан */
  amount: number;
  /** Клиенттің банк қосымшасында көрінетін сипаттама: «Medeo · Тауық донері · 4 дана» */
  description: string;
  user: { id: string; telegramId: number };
  /** Сақталған картаның токені немесе бір реттік криптограмма (жаңа карта) */
  /** hosted — карта банктің қорғалған бетінде енгізіледі (клиент confirmUrl-ға өтеді) */
  /** qr — «Halyk арқылы төлеу»: карта жоқ, клиент банк қосымшасында (Homebank) растайды */
  card: { token?: string; cryptogram?: string; save?: boolean; hosted?: boolean; qr?: boolean };
  /** Бөліп төлеу айлары (мекеме қосқан, банк беті ұсынады): [3, 6, 12] */
  installment?: number[];
  /** Клиент «Бөліп төлеу» тәсілін таңдады — банк беті рассрочка қойындысымен ашылады */
  preferInstallment?: boolean;
  /** 3-D Secure біткен соң клиент оралатын мекенжай */
  returnUrl: string;
}

export type ChargeResult =
  /** Бірден өтті (3-D Secure керек болмады не токенмен) */
  | { status: "paid"; externalId: string; card?: CardInfo }
  /** Банк растауы керек: клиент confirmUrl-ды ашады; нәтиже вебхукпен (не confirm сұрауымен) келеді */
  | { status: "action_required"; externalId: string; confirmUrl: string; /** QR төлемі: компьютерде көрсетілетін QR мәтіні */ qr?: string }
  /** Өтпеді: себебі клиентке түсінікті мәтінге айналдырылады */
  | { status: "failed"; externalId?: string; reason: FailReason };

export type FailReason = "3ds_required" | "declined" | "insufficient_funds" | "expired_card" | "3ds_failed" | "limit" | "fraud" | "provider_error";

/** Вебхуктан алынған нәтиже: externalId не paymentId арқылы төлемді табамыз */
export interface WebhookEvent { paymentId?: string; externalId: string; status: "paid" | "failed" | "pending"; reason?: FailReason; card?: CardInfo;
  /** Провайдер растаған сома (теңге). Берілсе — біздегі сомамен сәйкес келуі міндетті, әйтпесе төлем қабылданбайды */
  amount?: number;
  /** Провайдердегі клиент белгісі (біз жіберген users.id). Берілсе — төлем иесімен сәйкес келуі міндетті */
  accountId?: string }

export interface PaymentProvider {
  /** payments.provider бағанына жазылады */
  readonly name: string;
  /** Карта банктің бетінде енгізіледі (мини апп карта формасын көрсетпейді) */
  readonly hosted?: boolean;
  /** Банктің сынақ ортасы (ақша жүрмейді) — мини аппта белгі көрсетіледі */
  readonly testMode?: boolean;
  /** Банк қосымшасы арқылы QR төлемі қосулы (Halyk: HALYK_QR=on) */
  readonly qr?: boolean;
  /** Төлемнің нақты күйін провайдерден сұрау (хабарлама келмей қалса — мини апп күту бетінде осыны шақырады) */
  check?(externalId: string): Promise<WebhookEvent | null>;
  /** Төлем жасау (жаңа карта криптограммасы не сақталған карта токені) */
  charge(input: ChargeInput): Promise<ChargeResult>;
  /** Картаны сақтау (ақша алмай, токенге айналдыру): криптограмма → токен */
  tokenize(cryptogram: string, user: { id: string }): Promise<CardInfo>;
  /** Провайдердің вебхугын тексеру (қолтаңба!) және оқу. Жарамсыз болса — null */
  webhook(req: { headers: Record<string, string>; body: string; /** postLink сілтемесінің параметрлері (Halyk QR: inv, h) */ query?: Record<string, string> }): Promise<WebhookEvent | null>;
  /** Қайтару (толық не жартылай): клиенттің картасына/Kaspi-іне ақшаны қайтару. Нақты провайдер міндетті түрде жүзеге асырады. */
  refund?(externalId: string, amount: number): Promise<{ ok: boolean; reason?: string }>;
}

export class PaymentError extends Error { constructor(public code: string) { super(code); } }
