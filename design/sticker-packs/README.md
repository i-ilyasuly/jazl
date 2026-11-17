# Utya үйрек стикерлері (Telegram, анимациялы .tgs)

Патша 2026-11-17 жүктеген 5 пакет. Кез келген уақытта осы жерден аламыз.

| Файл | Пакет | Саны | Каталогтағы белгі |
|---|---|---|---|
| `HalloDuck.zip` | HalloDuck | 117 | HD |
| `UpdateDuck.zip` | UpdateDuck | 47 | UD |
| `UtyaDuck.zip` | UtyaDuck | 40 | U |
| `UtyaDuckFull.zip` | UtyaDuckFull | 100 | UF |
| `utyatheduck_by_fStikBot.zip` | utyatheduck_by_fStikBot | 66 | FS |

`catalog.webp` — барлық стикердің суреті (анимацияның ортасы) және белгісі: `HD 4919826` = `HalloDuck.zip` ішіндегі `file_4919826.tgs`.
Бір стикер бірнеше пакетте қайталануы мүмкін.

## Мини аппқа қосу
`.tgs` — gzip-пен сығылған Lottie JSON. Ашып, `miniapp/src/assets/stickers/<атауы>.json` етіп сақтаймыз да, `ui/Sticker.tsx` ішіндегі `StickerName` түріне атауын қосамыз:

```
python3 -c "import gzip,sys; open(sys.argv[2],'wb').write(gzip.open(sys.argv[1]).read())" file_4919826.tgs chart.json
```

## Қолданыстағы мекеме стикерлері (Figma «Стикер кітапханасы (мекеме)»)
| Атауы | Дереккөзі | Қай бетте |
|---|---|---|
| chart | HD 4919826 | Басты (иесі) |
| race | HD 4919854 | Кассир: басты |
| team | HD 4919838 | Команда |
| chef | HD 4919910 | Тапсырыстар |
| city | HD 4919810 | Мәзір |
| money | HD 4919829 | Есеп |
| clock | HD 4919875 | Төлем: банк күтілуде |
| partyhat | U 4919955 | Төлем өтті |
| painter | HD 4919867 | Ұсыныс құру: негізгі фото |
| headset | HD 4919836 | Қолдау |
| reader | HD 4919909 | Кассаға нұсқау |
| trophy | HD 4919809 | Жетістік: 100 қолдану |
| disco | FS 4919670 | Жетістік: рекорд күн |
