import * as QRCode from "qrcode";

const isMobileDevice = () => {
  if (typeof navigator === "undefined") return false;
  const ua = String(navigator.userAgent || "").toLowerCase();
  return /iphone|ipad|ipod|android|mobile|phone/.test(ua);
};

const isAndroidDevice = () => {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(String(navigator.userAgent || ""));
};

const isAppleMobileDevice = () => {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(String(navigator.userAgent || ""));
};

const BROTHER_STORE_SEARCH_ANDROID = "https://play.google.com/store/search?q=brother%20iprint%20label&c=apps";

const sanitizeFileName = (value) => {
  return String(value || "label")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "")
    .slice(0, 40) || "label";
};

const dataUrlToBlob = async (dataUrl) => {
  const response = await fetch(dataUrl);
  return response.blob();
};

const escapeHtml = (value) => {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const drawCenteredWrappedText = ({ ctx, text, x, y, maxWidth, lineHeight, maxLines }) => {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
    } else {
      lines.push(word);
      current = "";
    }

    if (lines.length >= maxLines) {
      break;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  const visible = lines.slice(0, maxLines);
  visible.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });

  return visible.length;
};

const generateBrotherLabelImage = async ({ invNumber, name, qrValue }) => {
  const normalizedInvNumber = String(invNumber || "").trim();
  const normalizedName = String(name || "").trim();
  const valueToEncode = String(qrValue || normalizedInvNumber || normalizedName || "").trim();

  if (!normalizedInvNumber || !normalizedName || !valueToEncode) {
    throw new Error("Для друку QR потрібні інвентарний номер і назва активу");
  }

  const qrDataUrl = await QRCode.toDataURL(valueToEncode, {
    margin: 1,
    width: 360,
    errorCorrectionLevel: "M",
  });

  const qrImage = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = qrDataUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 860;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Не вдалося згенерувати зображення етикетки");
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);

  ctx.fillStyle = "#111827";
  ctx.font = "bold 62px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const usedLines = drawCenteredWrappedText({
    ctx,
    text: normalizedName,
    x: canvas.width / 2,
    y: 44,
    maxWidth: canvas.width - 120,
    lineHeight: 72,
    maxLines: 2,
  });

  const invY = 44 + usedLines * 72 + 20;
  ctx.font = "bold 56px Arial";
  ctx.fillText(`Інв. №: ${normalizedInvNumber}`, canvas.width / 2, invY);

  const qrSize = 500;
  const qrX = (canvas.width - qrSize) / 2;
  const qrY = invY + 86;
  ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

  ctx.font = "34px Arial";
  ctx.fillStyle = "#374151";
  ctx.fillText(valueToEncode.slice(0, 72), canvas.width / 2, qrY + qrSize + 26);

  const pngDataUrl = canvas.toDataURL("image/png");
  const pngBlob = await dataUrlToBlob(pngDataUrl);
  const fileName = `${sanitizeFileName(normalizedInvNumber)}-qr-label.png`;

  return { pngDataUrl, pngBlob, fileName };
};

const downloadBlob = (blob, fileName) => {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
};

const shareBrotherFilesDirect = async ({ pngBlob, fileName }) => {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return false;
  }

  try {
    const pngFile = new File([pngBlob], fileName, { type: "image/png" });
    if (typeof navigator.canShare === "function" && !navigator.canShare({ files: [pngFile] })) {
      return false;
    }

    await navigator.share({
      title: "QR етикетка",
      text: "Відкрити у Brother iPrint&Label",
      files: [pngFile],
    });
    return true;
  } catch {
    return false;
  }
};

const openImageInNewTab = (dataUrl) => {
  const win = window.open("", "_blank");
  if (!win) return false;

  win.document.open();
  win.document.write(`<!doctype html><html><head><meta charset="UTF-8"/><title>QR Label</title></head><body style="margin:0;background:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh;"><img src="${dataUrl}" alt="QR Label" style="max-width:100%;height:auto;" /></body></html>`);
  win.document.close();
  return true;
};

const openBrotherHelperPage = ({ pngDataUrl, fileName, labelTitle }) => {
  const win = window.open("", "_blank");
  if (!win) return false;

  const safeTitle = escapeHtml(labelTitle);
  const safePngName = escapeHtml(fileName);

  win.document.open();
  win.document.write(`<!doctype html>
<html lang="uk">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Brother QR Label</title>
    <style>
      body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; background: #0f172a; color: #e2e8f0; }
      .wrap { max-width: 860px; margin: 0 auto; padding: 18px; }
      h1 { font-size: 20px; margin: 0 0 6px; }
      p { margin: 0 0 12px; color: #cbd5e1; }
      .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
      button, a.btn {
        border: 1px solid #334155; border-radius: 10px; padding: 12px 10px; text-align: center;
        background: #1e293b; color: #f8fafc; font-size: 14px; font-weight: 700; text-decoration: none;
      }
      button.primary, a.btn.primary { background: #4f46e5; border-color: #6366f1; }
      img { width: 100%; height: auto; border-radius: 10px; border: 1px solid #334155; background: #fff; }
      .note { margin-top: 10px; font-size: 13px; color: #94a3b8; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>Етикетка: ${safeTitle}</h1>
      <p>Якщо Brother не видно в системному списку, спочатку натисніть "Відкрити Brother", далі імпортуйте PNG/JPG з Файлів.</p>
      <div class="actions">
        <button id="shareBtn" class="primary">Поділитись PNG</button>
        <button id="openBrotherBtn">Відкрити Brother</button>
        <a id="downloadPng" class="btn" download="${safePngName}" href="${pngDataUrl}">Завантажити PNG</a>
        <div class="btn" style="display:flex;align-items:center;justify-content:center;opacity:.6">Lossless формат</div>
      </div>
      <img src="${pngDataUrl}" alt="QR label" />
      <div class="note">Якщо не друкує чітко: у Brother app оберіть режим друку "Actual size / 100%".</div>
    </div>
    <script>
      const pngDataUrl = ${JSON.stringify(pngDataUrl)};
      const fileName = ${JSON.stringify(fileName)};

      async function dataUrlToFile(dataUrl, name, type) {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        return new File([blob], name, { type });
      }

      document.getElementById('shareBtn').addEventListener('click', async () => {
        try {
          if (!navigator.share) {
            alert('Функція Поділитись недоступна в цьому браузері. Скачайте PNG/JPG і відкрийте через Brother app.');
            return;
          }

          const pngFile = await dataUrlToFile(pngDataUrl, fileName, 'image/png');
          if (navigator.canShare && !navigator.canShare({ files: [pngFile] })) {
            alert('Ваш браузер не підтримує передачу файлів через Поділитись. Використайте кнопки завантаження.');
            return;
          }

          await navigator.share({
            title: 'QR етикетка',
            text: 'Відкрити у Brother iPrint&Label',
            files: [pngFile],
          });
        } catch (e) {
          // canceled or failed
        }
      });

      document.getElementById('openBrotherBtn').addEventListener('click', () => {
        const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent || '');
        const isAndroid = /android/i.test(navigator.userAgent || '');
        const fallbackUrl = ${JSON.stringify(BROTHER_STORE_SEARCH_ANDROID)};

        if (isIOS) {
          alert('На iPhone відкрийте Brother iPrint&Label вручну, далі Import -> Files/Photos і оберіть PNG або JPG.');
          return;
        }

        if (isAndroid) {
          const intent = 'intent://open#Intent;scheme=brotheriprintandlabel;package=com.brother.ptouch.iprintandlabel;S.browser_fallback_url=' + encodeURIComponent(fallbackUrl) + ';end';
          window.location.href = intent;
          return;
        }

        const startTs = Date.now();
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = 'brotheriprintandlabel://';
        document.body.appendChild(iframe);

        setTimeout(() => {
          iframe.remove();
          if (Date.now() - startTs < 1700) {
            alert('Не вдалося відкрити Brother автоматично. Відкрийте Brother iPrint&Label вручну, далі Import -> Files/Photos.');
          }
        }, 1200);
      });
    </script>
  </body>
</html>`);
  win.document.close();
  return true;
};

const openBrotherAppAggressive = () => {
  if (isAndroidDevice()) {
    const intentUrl = `intent://open#Intent;scheme=brotheriprintandlabel;package=com.brother.ptouch.iprintandlabel;S.browser_fallback_url=${encodeURIComponent(BROTHER_STORE_SEARCH_ANDROID)};end`;
    window.location.href = intentUrl;
    return;
  }

  // iOS: do not force deep-link open because Safari may show blocking error dialogs.
  if (isAppleMobileDevice()) {
    return;
  }

  window.location.href = "brotheriprintandlabel://";
};

export const printAssetQrLabel = async ({
  invNumber,
  name,
  qrValue,
}) => {
  if (isMobileDevice()) {
    const generated = await generateBrotherLabelImage({ invNumber, name, qrValue });

    if (isAndroidDevice()) {
      // Android-first flow without popups: native share from current tab.
      const shared = await shareBrotherFilesDirect(generated);
      if (shared) {
        return;
      }

      downloadBlob(generated.pngBlob, generated.fileName);
      alert("Браузер блокує вікна дій. PNG етикетку завантажено. Відкрийте Brother iPrint&Label -> Import -> Files/Photos.");
      return;
    }

    // First try to open Brother app immediately (same user gesture flow).
    // If OS/browser blocks it, user still gets helper UI with share/download actions.
    try {
      openBrotherAppAggressive();
    } catch {
      // Ignore and continue to helper screen.
    }

    const opened = openBrotherHelperPage({
      ...generated,
      labelTitle: `${String(name || "").trim()} · ${String(invNumber || "").trim()}`,
    });

    if (!opened) {
      // Pop-up blocked fallback
      downloadBlob(generated.pngBlob, generated.fileName);
      downloadBlob(generated.jpgBlob, generated.jpgFileName);
      alert("Вікно дій заблоковано браузером. PNG етикетку завантажено. Імпортуйте файл у Brother app.");
    }

    return;
  }

  const printWindow = window.open("", "_blank", "width=420,height=620");
  if (!printWindow) {
    throw new Error("Не вдалося відкрити вікно друку. Дозвольте pop-up у браузері.");
  }

  const normalizedInvNumber = String(invNumber || "").trim();
  const normalizedName = String(name || "").trim();
  const valueToEncode = String(qrValue || normalizedInvNumber || normalizedName || "").trim();

  if (!normalizedInvNumber || !normalizedName || !valueToEncode) {
    printWindow.close();
    throw new Error("Для друку QR потрібні інвентарний номер і назва активу");
  }

  const qrDataUrl = await QRCode.toDataURL(valueToEncode, {
    margin: 1,
    width: 240,
    errorCorrectionLevel: "M",
  });

  const html = `
<!doctype html>
<html lang="uk">
  <head>
    <meta charset="UTF-8" />
    <title>QR етикетка активу</title>
    <style>
      @page { size: 58mm auto; margin: 3mm; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
        color: #0f172a;
        background: #ffffff;
      }
      .label {
        width: 52mm;
        margin: 0 auto;
        border: 1px dashed #cbd5e1;
        border-radius: 2mm;
        padding: 2.5mm;
        text-align: center;
      }
      .title {
        font-size: 9pt;
        line-height: 1.25;
        font-weight: 700;
        word-break: break-word;
      }
      .inv {
        margin-top: 1.5mm;
        font-size: 8pt;
        font-weight: 700;
      }
      .qr {
        display: block;
        width: 36mm;
        height: 36mm;
        margin: 2mm auto 0;
      }
      .hint {
        margin-top: 2mm;
        font-size: 7pt;
        color: #475569;
      }
    </style>
  </head>
  <body>
    <div class="label">
      <div class="title">${normalizedName}</div>
      <div class="inv">Інв. №: ${normalizedInvNumber}</div>
      <img id="qr-img" class="qr" src="${qrDataUrl}" alt="QR ${normalizedInvNumber}" />
      <div class="hint">Якщо друк не стартував — натисніть Ctrl/Cmd+P</div>
    </div>
    <script>
      (function() {
        const img = document.getElementById('qr-img');
        const start = () => {
          setTimeout(() => {
            window.focus();
            window.print();
          }, 120);
        };

        if (img && img.complete) {
          start();
        } else if (img) {
          img.onload = start;
          img.onerror = start;
        } else {
          start();
        }
      })();
    </script>
  </body>
</html>
`;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
};
