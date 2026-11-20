// Liquid Glass (Патша, 2026-11-18; негізі — «Бюро SVLV» t.me/buro_svlv жазбасындағы SVG сүзгі).
// Жазбадағы нұсқа бет астындағы ТҰРАҚТЫ тұсқағазды (wall) сындырады. Біздің навигация айналып жатқан мазмұнның
// үстінде тұрады, сондықтан сол сүзгіні backdrop-filter-ге қолданамыз: шыны артындағы НАҚТЫ мазмұнды шеттерінде
// сындырады (линза сияқты), ортасы мөлдір әрі анық қалады — мәтін оқылады.
// Сүзгі: элементтің пішінін бұлдыратып (SourceAlpha), екі жақтан «жарық түсіріп» (feDiffuseLighting) X/Y көлбеу картасын
// жасайды → feDisplacementMap фонды сол картамен ығыстырады (шеттері сынады) → қанықтық сәл көтеріледі.
// Chromium (Android Telegram, Desktop) backdrop-filter: url(#…) қолдайды. iOS/Safari (WebKit) — қолдамайды:
// онда бұлдыр шыны + жарқыл жиектер (ескі әдемі нұсқа) қалады.
const ID = "medeo-lg";
let injected = false;
/** WebKit (iPhone, iPad, Safari): SVG сүзгіні backdrop-filter-де салмайды */
export const isWebKit = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Safari\//.test(navigator.userAgent) && !/Chrome|Chromium|Edg|OPR|Android/.test(navigator.userAgent));

/** SVG сүзгіні бетке бір рет қосады. Қолдау бар ма (Chromium) — соны қайтарады. */
export function ensureLiquidGlass(): boolean {
  if (isWebKit()) return false;
  if (!injected) {
    injected = true;
    document.body.insertAdjacentHTML("beforeend",
      `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="${ID}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">` +
      `<feGaussianBlur in="SourceAlpha" stdDeviation="6" result="a"/>` +
      `<feDiffuseLighting in="a" surfaceScale="8" diffuseConstant=".7071" result="x"><feDistantLight azimuth="0" elevation="45"/></feDiffuseLighting>` +
      `<feDiffuseLighting in="a" surfaceScale="8" diffuseConstant=".7071" result="y"><feDistantLight azimuth="90" elevation="45"/></feDiffuseLighting>` +
      `<feColorMatrix in="x" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 .5 0 0 0 0 1" result="r"/>` +
      `<feColorMatrix in="y" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 0 1" result="g"/>` +
      `<feComposite in="r" in2="g" operator="arithmetic" k2="1" k3="1" result="m"/>` +
      `<feDisplacementMap in="SourceGraphic" in2="m" scale="-34" xChannelSelector="R" yChannelSelector="G"/>` +
      `<feColorMatrix type="saturate" values="1.45"/></filter></svg>`);
  }
  return true;
}
