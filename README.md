# Համար → PDF

Выбираешь **сразу много** фото հարկային հաշիվ → жмёшь **Сделать PDF**.

- На **каждое** фото скачивается **отдельный** PDF
- Имя = **последние 4 цифры** поля **Համար** (`2815.pdf`)
- Если last4 совпали — `2815.pdf`, `2815_2.pdf`, …

## Как открыть

Открой `index.html` в браузере (или через любой static hosting / GitHub Pages).

Интернет нужен для CDN (Tesseract.js + jsPDF). OCR и PDF делаются **в браузере** — фото на сервер не уходит.

## Стек

- [Tesseract.js](https://tesseract.projectnaptha.com/) — OCR номера Համար
- [jsPDF](https://github.com/parallax/jsPDF) — PDF с картинкой
