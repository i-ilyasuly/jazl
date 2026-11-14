# Jazl+ Mini App

Jazl+ клиент қосымшасының Telegram Mini App фронтенді. Дизайн көзі: Figma, «Jazl+» беті (412×917, Android, Roboto).

## Іске қосу

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ қалтасына жинайды
```

## Стек

React 19, TypeScript, Vite, React Router (hash), CSS Modules. Бэкенд әзірге жоқ: деректер `src/mocks/` ішінде.

## Құрылым

- `src/styles/tokens.css` — Figma-дан алынған түстер (Light, Dark)
- `src/assets/icons/` — Figma-дан экспортталған SVG белгішелер (өзгертілмеген)
- `src/telegram.ts` — Telegram WebApp API: толық экран, нативті «Артқа», нативті төменгі батырмалар, хаптика
- `src/ui/` — ортақ компоненттер (навигация, ұсыныс карточкасы, Telegram батырмаларының көшірмесі)
- `src/screens/` — экрандар

## Дайын экрандар (1-кезең)

| Экран | Figma кадры | Жол |
|---|---|---|
| Басты | `13886:15161` | `#/` |
| Ұсыныс беті | `13886:21003` | `#/offer/:id` |

## Telegram ішінде және браузерде

Telegram ішінде жоғарғы батырмаларды (Жабу/Артқа, ⌄ ⋯) және төменгі «Сыйлау / Төлеу» батырмаларын Telegram-ның өзі салады. Браузерде ашқанда солардың көшірмесі көрсетіледі, сонда экранды Figma-мен салыстыруға болады.
