// Кіру нүктесі: алдымен тіл (орыс сөздігі керек болса жүктеледі), сосын қосымшаның өзі.
import { initLang } from "./i18n";
void initLang().catch(() => undefined).then(() => import("./main"));
