// Бұрын бэкенд жоқ кезде желі кідірісін еліктейтін (450–650 мс жасанды скелет). Патша (2026-11-18, видео): ашылу ұзақ —
// деректер құрылғыда дайын тұрғанда күтудің мәні жоқ, сондықтан енді бірден қайтарады. Нақты жүктелу бар беттерде скелет өз күйімен көрсетіледі.

/** Бос күйді көру үшін: мекенжайға ?empty=1 қосылады (бэкенд қосылғанша). */
export const demoEmpty = () => window.location.hash.includes("empty=1");

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useMock<T>(_key: string, data: T, _delay = 0): { data: T | null; loading: boolean } {
  return { data, loading: false };
}
