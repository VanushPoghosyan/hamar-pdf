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
      setStatus(`Выбрано фото: ${selected.length}. Нажми «Сделать PDF».`);
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

    try {
      const pages = [];
      const last4s = [];

      for (let i = 0; i < selected.length; i++) {
        const item = selected[i];
        setStatus(`OCR ${i + 1}/${selected.length}: ${item.file.name}`);
        const hamar = await extractHamar(item.dataUrl, i + 1, selected.length);
        if (!hamar) {
          throw new Error(
            `Не найден Համար на фото ${i + 1} (${item.file.name}). Нужен более чёткий снимок.`
          );
        }
        const last4 = hamar.slice(-4);
        last4s.push(last4);
        pages.push({ dataUrl: item.dataUrl, hamar, last4 });
        setStatus(
          `OCR ${i + 1}/${selected.length}: Համար ${hamar} → ${last4}`
        );
      }

      const filename = buildFilename(last4s);
      setStatus(`Собираю PDF (${pages.length} стр.) → ${filename}`);
      await makeMultiPagePdf(pages, filename);

      const list = pages.map((p, i) => `${i + 1}) ${p.hamar} → ${p.last4}`).join('\n');
      setStatus(`Готово: ${filename}\n${list}`, 'ok');
    } catch (err) {
      console.error(err);
      setStatus(err.message || String(err), 'err');
    } finally {
      setBusy(false);
    }
  }

  function buildFilename(last4s) {
    const unique = [...new Set(last4s)];
    if (unique.length === 1) return `${unique[0]}.pdf`;
    // keep order of first appearance, limit length
    const joined = unique.slice(0, 6).join('_');
    return `${joined}.pdf`;
  }

  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
      reader.readAsDataURL(file);
    });
  }

  async function extractHamar(dataUrl, index, total) {
    const { data } = await Tesseract.recognize(dataUrl, 'eng', {
      logger: (m) => {
        if (m.status === 'recognizing text' && m.progress != null) {
          const pct = Math.round(m.progress * 100);
          setStatus(`OCR ${index}/${total}… ${pct}%`);
        }
      },
    });
    return pickHamarFromText((data && data.text) || '');
  }

  function pickHamarFromText(text) {
    const cleaned = String(text).replace(/[Oo]/g, '0').replace(/[Il|]/g, '1');

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

    const ten = candidates.find((c) => c.length === 10);
    if (ten) return ten;
    if (candidates.length) {
      return candidates.sort((a, b) => b.length - a.length)[0];
    }
    return null;
  }

  async function makeMultiPagePdf(pages, filename) {
    const { jsPDF } = window.jspdf;
    let pdf = null;

    for (let i = 0; i < pages.length; i++) {
      const dataUrl = pages[i].dataUrl;
      const img = await loadImage(dataUrl);
      const orientation = img.width >= img.height ? 'landscape' : 'portrait';

      if (!pdf) {
        pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
      } else {
        pdf.addPage('a4', orientation);
      }

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
    }

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
