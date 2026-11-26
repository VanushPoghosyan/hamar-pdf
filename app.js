(() => {
  const pickBtn = document.getElementById('pickBtn');
  const makeBtn = document.getElementById('makeBtn');
  const fileInput = document.getElementById('file');
  const statusEl = document.getElementById('status');
  const preview = document.getElementById('preview');

  /** @type {{ file: File, dataUrl: string }[]} */
  let selected = [];

  function setStatus(text, kind = '') {
    statusEl.textContent = text;
    statusEl.className = 'status' + (kind ? ` ${kind}` : '');
  }

  function setBusy(busy) {
    pickBtn.disabled = busy;
    makeBtn.disabled = busy || selected.length === 0;
  }

  pickBtn.addEventListener('click', () => fileInput.click());
  makeBtn.addEventListener('click', () => processSelected());

  fileInput.addEventListener('change', async () => {
    const files = Array.from(fileInput.files || []);
    fileInput.value = '';
    if (!files.length) return;

    setBusy(true);
    setStatus(`Читаю ${files.length} фото…`);
    try {
      selected = [];
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        selected.push({ file, dataUrl: await readAsDataURL(file) });
      }
      if (!selected.length) throw new Error('Нет изображений в выборе');
      renderPreview();
      setStatus(
        `Выбрано фото: ${selected.length}. Нажми «Сделать PDF» — будет отдельный PDF на каждое.`
      );
    } catch (err) {
      console.error(err);
      selected = [];
      renderPreview();
      setStatus(err.message || String(err), 'err');
    } finally {
      setBusy(false);
    }
  });

  function renderPreview() {
    preview.innerHTML = '';
    if (!selected.length) {
      preview.classList.remove('show');
      return;
    }
    preview.classList.add('show');
    for (const item of selected) {
      const fig = document.createElement('figure');
      const img = document.createElement('img');
      img.src = item.dataUrl;
      img.alt = item.file.name;
      const cap = document.createElement('figcaption');
      cap.textContent = item.file.name;
      fig.append(img, cap);
      preview.appendChild(fig);
    }
  }

  async function processSelected() {
    if (!selected.length) return;
    setBusy(true);

    const ok = [];
    const fail = [];

    try {
      for (let i = 0; i < selected.length; i++) {
        const item = selected[i];
        setStatus(`OCR ${i + 1}/${selected.length}: ${item.file.name}`);

        try {
          const hamar = await extractHamar(item.dataUrl, i + 1, selected.length);
          if (!hamar) {
            throw new Error('Համար не найден');
          }
          const last4 = hamar.slice(-4);
          const filename = uniqueFilename(last4, ok);
          setStatus(
            `PDF ${i + 1}/${selected.length}: Համար ${hamar} → ${filename}`
          );
          // PDF = original photo unchanged
          await makeSinglePdf(item.dataUrl, filename);
          ok.push({ filename, hamar, last4 });
          await sleep(350);
        } catch (err) {
          console.error(item.file.name, err);
          fail.push({
            name: item.file.name,
            reason: err.message || String(err),
          });
        }
      }

      const lines = [];
      lines.push(`Готово PDF: ${ok.length} из ${selected.length}`);
      for (const row of ok) {
        lines.push(`✓ ${row.filename} (Համար ${row.hamar})`);
      }
      for (const row of fail) {
        lines.push(`✗ ${row.name}: ${row.reason}`);
      }
      setStatus(lines.join('\n'), fail.length ? 'err' : 'ok');
    } finally {
      setBusy(false);
    }
  }

  function uniqueFilename(last4, alreadyOk) {
    const used = new Set(alreadyOk.map((r) => r.filename));
    let name = `${last4}.pdf`;
    let n = 2;
    while (used.has(name)) {
      name = `${last4}_${n}.pdf`;
      n += 1;
    }
    return name;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Find 10-digit Համար (also printed as A7627426960 / B0897354074 in corner).
   * Tries crops + rotations; does not alter the photo used for PDF.
   */
  async function extractHamar(dataUrl, index, total) {
    const img = await loadImage(dataUrl);
    const variants = buildOcrVariants(img);

    for (let v = 0; v < variants.length; v++) {
      setStatus(`OCR ${index}/${total}: вариант ${v + 1}/${variants.length}`);
      const text = await ocrDigits(variants[v], index, total, v + 1, variants.length);
      const hamar = pickHamarFromText(text);
      if (hamar) return hamar;
    }
    return null;
  }

  function buildOcrVariants(img) {
    const out = [];
    // Full + top band (serial / [3] Համար live at top)
    const sources = [
      { sx: 0, sy: 0, sw: img.width, sh: img.height, label: 'full' },
      { sx: 0, sy: 0, sw: img.width, sh: Math.floor(img.height * 0.28), label: 'top' },
      {
        sx: Math.floor(img.width * 0.45),
        sy: 0,
        sw: Math.floor(img.width * 0.55),
        sh: Math.floor(img.height * 0.22),
        label: 'top-right',
      },
    ];

    for (const src of sources) {
      for (const deg of [0, 90, 270, 180]) {
        out.push(renderVariant(img, src, deg, 2.2));
      }
    }
    return out;
  }

  function renderVariant(img, src, deg, scale) {
    const sw = Math.max(1, src.sw);
    const sh = Math.max(1, src.sh);
    const rad = (deg * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    const rw = Math.floor((sw * cos + sh * sin) * scale);
    const rh = Math.floor((sw * sin + sh * cos) * scale);

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, rw);
    canvas.height = Math.max(1, rh);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rad);
    ctx.scale(scale, scale);
    ctx.drawImage(img, src.sx, src.sy, sw, sh, -sw / 2, -sh / 2, sw, sh);
    ctx.restore();

    // Boost contrast for faint serial numbers
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const v = g < 160 ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  }

  async function ocrDigits(dataUrl, index, total, variant, variantTotal) {
    const { data } = await Tesseract.recognize(dataUrl, 'eng', {
      logger: (m) => {
        if (m.status === 'recognizing text' && m.progress != null) {
          const pct = Math.round(m.progress * 100);
          setStatus(
            `OCR ${index}/${total} · var ${variant}/${variantTotal}… ${pct}%`
          );
        }
      },
      tessedit_char_whitelist: '0123456789ABOIlabcdefghijklmnopqrsuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
      preserve_interword_spaces: '1',
    });
    return (data && data.text) || '';
  }

  function pickHamarFromText(text) {
    const cleaned = String(text)
      .replace(/[Oo]/g, '0')
      .replace(/[Il|]/g, '1')
      .replace(/[Ss]/g, '5')
      .replace(/[Bb](?=\d)/g, 'B')
      .replace(/[Aa](?=\d)/g, 'A');

    const candidates = [];

    // Corner serial: A7627426960 / B0897354074
    for (const m of cleaned.matchAll(/\b([AB])\s*([0-9]{9,11})\b/gi)) {
      const digits = m[2].replace(/\D/g, '');
      if (digits.length >= 9 && digits.length <= 11) {
        candidates.push({ value: normalizeHamar(digits), score: 100 });
      }
    }

    // Stuck together without space: A7627426960
    for (const m of cleaned.matchAll(/([AB])([0-9]{9,11})/gi)) {
      candidates.push({ value: normalizeHamar(m[2]), score: 95 });
    }

    // Near label noise (OCR may mangled Համար)
    for (const m of cleaned.matchAll(
      /(?:Համար|Hamar|HAMAR|HAMAP|HAMA|N[oо°]?\.?|№|\[?\s*3\s*\]?)\s*[:#.\-_]?\s*([0-9]{8,12})/gi
    )) {
      candidates.push({ value: normalizeHamar(m[1]), score: 80 });
    }

    // Any 10-digit block
    for (const m of cleaned.matchAll(/(?<!\d)([0-9]{10})(?!\d)/g)) {
      const v = m[1];
      // Prefer typical invoice numbers (often start with 0) over random IDs
      let score = 40;
      if (v.startsWith('0')) score = 55;
      // Downrank common TIN-looking / bank-like if many zeros
      if (/^0{2,}/.test(v) && v.endsWith('0000')) score = 10;
      candidates.push({ value: v, score });
    }

    // 9–11 digit fallbacks
    for (const m of cleaned.matchAll(/(?<!\d)([0-9]{9,11})(?!\d)/g)) {
      candidates.push({ value: normalizeHamar(m[1]), score: 25 });
    }

    const filtered = candidates
      .map((c) => ({ ...c, value: (c.value || '').replace(/\D/g, '') }))
      .filter((c) => c.value.length >= 9 && c.value.length <= 11);

    if (!filtered.length) return null;

    filtered.sort((a, b) => b.score - a.score || b.value.length - a.value.length);
    return filtered[0].value.length === 10
      ? filtered[0].value
      : normalizeHamar(filtered[0].value);
  }

  function normalizeHamar(digits) {
    const d = String(digits).replace(/\D/g, '');
    if (d.length === 10) return d;
    if (d.length === 9) return `0${d}`;
    if (d.length === 11 && d.startsWith('0')) return d.slice(0, 10);
    if (d.length > 10) return d.slice(-10);
    return d;
  }

  async function makeSinglePdf(dataUrl, filename) {
    const { jsPDF } = window.jspdf;
    const img = await loadImage(dataUrl);
    const orientation = img.width >= img.height ? 'landscape' : 'portrait';
    const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });

    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 6;
    const maxW = pageW - margin * 2;
    const maxH = pageH - margin * 2;
    const scale = Math.min(maxW / img.width, maxH / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;

    pdf.addImage(dataUrl, guessImageFormat(dataUrl), x, y, w, h);
    pdf.save(filename);
  }

  function guessImageFormat(dataUrl) {
    if (dataUrl.startsWith('data:image/png')) return 'PNG';
    if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
    return 'JPEG';
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Не удалось открыть изображение'));
      img.src = src;
    });
  }
})();
