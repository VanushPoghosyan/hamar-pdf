# Համար → PDF

Одна кнопка: загружаешь фото հարկային հաշիվ → скачивается PDF с этим фото.

Имя файла = **последние 4 цифры** поля **Համար**  
Пример: `Համար 0931692815` → `2815.pdf`

## Как открыть

Открой `index.html` в браузере (или через любой static hosting / GitHub Pages).

Интернет нужен для CDN (Tesseract.js + jsPDF). OCR и PDF делаются **в браузере** — фото на сервер не уходит.

## Стек

- [Tesseract.js](https://tesseract.projectnaptha.com/) — OCR номера Համար
- [jsPDF](https://github.com/parallax/jsPDF) — PDF с картинкой
