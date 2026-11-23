// Баға: сан + кішірек ₸ (UX, Патша 2026-11-23). Medeo Sans-тағы ₸ белгісі сандардан жіңішке әрі биік көрінеді —
// 18%-ға кішірейтіп, сандардың төменгі сызығында ұстаймыз; ірі бағалар жинақы тұрады.
const group = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
export function Money({ n, suffix }: { n: number; suffix?: string }) {
  return <>{group(n)}{" "}<span className="cur">₸</span>{suffix}</>;
}
