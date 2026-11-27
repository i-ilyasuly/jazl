// Сайттың ортақ баптаулары. Деректемелер мен байланыс — БІР жерде: компания тіркелген соң тек осы файл толтырылады.
// [Тік жақшадағы] мәндер — әлі белгісіз (ойдан толтырылмайды). Бет оларды сол күйінде көрсетеді.

export const BOT = "Mmedeo_bot";
export const BOT_URL = `https://t.me/${BOT}`;
/** Мини аппты ашу. startapp=site — мини апп бетті ауыстырмайды (main.tsx), бірақ «Көздер» есебінде сайттан келгені көрінеді */
export const APP_URL = `https://t.me/${BOT}?startapp=site`;
/** Мекеме тіркелуі: мини апптағы бар ағын (startapp=v_new → /v/apply). Кейін сайттағы формаға ауысады */
export const VENUE_APPLY_URL = `https://t.me/${BOT}?startapp=v_new`;

/** Halyk ePay талабы: логотип epayment.kz сайтына апарады */
export const EPAY_URL = "https://epayment.kz";

export const COMPANY = {
  nameKk: "«Medeo» ЖШС",
  nameRu: "ТОО «Medeo»",
  bin: "[БСН]",
  legalAddressKk: "[Заңды мекенжай]",
  legalAddressRu: "[Юридический адрес]",
  addressKk: "[Нақты мекенжай: Алматы қ., көше, үй]",
  addressRu: "[Фактический адрес: г. Алматы, улица, дом]",
  bankKk: "«Halyk Bank» АҚ",
  bankRu: "АО «Halyk Bank»",
  iik: "[ЖСК / IBAN]",
  email: "[email]",
  phone: "[+7 ___ ___ __ __]",
  /** Қолдау: Telegram (бот арқылы) */
  support: `@${BOT}`,
  hoursKk: "Дс–Жс, 09:00–23:00",
  hoursRu: "Пн–Вс, 09:00–23:00",
};

/** Үлгі деректер (Figma-дағы мысал ұсыныстар мен пікірлер) — тек PUBLIC_DEMO=1 болса (дизайнды қарау үшін).
 *  Әдепкіде өшірулі: нақты ұсыныстар каталогтан, пікірлер нақты сатып алудан (28-құжат: кемінде 10 расталған пікір) келгенде ғана. */
export const DEMO = import.meta.env.PUBLIC_DEMO === "1";

/** [тік жақшадағы] мән — әлі толтырылмаған */
export const isBlank = (v: string) => v.startsWith("[");
