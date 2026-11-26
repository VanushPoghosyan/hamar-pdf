(() => {
  const pickBtn = document.getElementById('pickBtn');
  const fileInput = document.getElementById('file');
  const statusEl = document.getElementById('status');
  const preview = document.getElementById('preview');
  const previewImg = document.getElementById('previewImg');

  function setStatus(text, kind = '') {
    statusEl.textContent = text;
    statusEl.className = 'status' + (kind ? ` ${kind}` : '');
  }

  pickBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    await processFile(file);
  });

  async function processFile(file) {
    pickBtn.disabled = true;
    setStatus('Читаю фото…');

    try {
      const dataUrl = await readAsDataURL(file);
      previewImg.src = dataUrl;
      preview.style.display = 'block';

      setStatus('Ищу номер Համար (OCR)…');
      const hamar = await extractHamar(dataUrl);
      if (!hamar) {
        throw new Error(
          'Не удалось найти Համար на фото. Загрузи более чёткий снимок (поле [3] Համար).'
        );
      }

      const last4 = hamar.slice(-4);
      setStatus(`Համար: ${hamar} → файл ${last4}.pdf\nСобираю PDF…`);

      await makePdf(dataUrl, `${last4}.pdf`);
      setStatus(`Готово: ${last4}.pdf (Համար ${hamar})`, 'ok');
    } catch (err) {
      console.error(err);
      setStatus(err.message || String(err), 'err');
    } finally {
      pickBtn.disabled = false;
    }
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
   * Armenian tax invoice: field [3] Համար is usually 10 digits,
   * serial in corner often looks like A0931692815.
   */
  async function extractHamar(dataUrl) {
    const { data } = await Tesseract.recognize(dataUrl, 'eng', {
      logger: (m) => {
        if (m.status === 'recognizing text' && m.progress != null) {
          const pct = Math.round(m.progress * 100);
          setStatus(`Ищу номер Համար (OCR)… ${pct}%`);
        }
      },
    });

    const text = (data && data.text) || '';
    return pickHamarFromText(text);
  }

  function pickHamarFromText(text) {
    const cleaned = String(text).replace(/[Oo]/g, '0').replace(/[Il|]/g, '1');

    // Serial like A0931692815 → 0931692815
    const serial = cleaned.match(/\bA?\s*([0-9]{9,12})\b/i);
    const nearHamar = cleaned.match(
      /(?:Համար|Hamar|HAMAR|N[oо]?\.?|№)\s*[:#]?\s*([0-9]{8,12})/i
    );

    const candidates = [];
    if (nearHamar) candidates.push(nearHamar[1]);
    if (serial) candidates.push(serial[1]);

    for (const m of cleaned.matchAll(/\b([0-9]{10})\b/g)) {
      candidates.push(m[1]);
    }

    // Prefer 10-digit numbers typical for Համար
    const ten = candidates.find((c) => c.length === 10);
    if (ten) return ten;
    if (candidates.length) {
      return candidates.sort((a, b) => b.length - a.length)[0];
    }
    return null;
  }

  async function makePdf(dataUrl, filename) {
    const { jsPDF } = window.jspdf;
    const img = await loadImage(dataUrl);

    const orientation = img.width >= img.height ? 'l' : 'p';
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

    const format = guessImageFormat(dataUrl);
    pdf.addImage(dataUrl, format, x, y, w, h);
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
