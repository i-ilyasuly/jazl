// Сөз-сөзімен шығатын (анимациялы) сөйлем: тұтас мәтін бір кілт болып аударылады, сосын сөздерге бөлінеді.
// Белгілеу: [blue:жаңа клиенттер] — түсті сөз тіркесі; соңындағы тыныс белгісі тіркеспен бірге қалады.
// Мысал: "Мекемеңе [blue:жаңа тұрақты клиенттер] әкел." — орысшада: "Приведите [blue:новых постоянных клиентов] в заведение."
export function RichWords({ text, cls }: { text: string; cls: Record<string, string> }) {
  const parts = text.match(/\[\w+:[^\]]+\][.,:;!?]?|\S+/g) ?? [];
  return <>{parts.map((p, i) => {
    const m = /^\[(\w+):([^\]]+)\](.*)$/.exec(p);
    if (!m) return <span key={i}>{p}</span>;
    return m[3] ? <span key={i} className={cls.nogap}><b className={cls[m[1]]}>{m[2]}</b>{m[3]}</span> : <b key={i} className={cls[m[1]]}>{m[2]}</b>;
  })}</>;
}
