// Medeo. белгісі (Патша, 2026-11-17): «Medeo» + көк нүкте. Мәтін ішінде — нүктесіз «Medeo», логотип орнында — осы белгі.
export function Brand({ dot = "#229af0" }: { dot?: string }) {
  return <>Medeo<span style={{ color: dot }}>.</span></>;
}
