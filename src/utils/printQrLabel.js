/* ------------------------------------------------------------------ *
 *  printQrLabel – thermal-transfer network printer (TSPL, 20×30 mm)  *
 * ------------------------------------------------------------------ */

let qrCodeModulePromise;

const getQRCodeModule = async () => {
  if (!qrCodeModulePromise) {
    qrCodeModulePromise = import("qrcode");
  }
  const mod = await qrCodeModulePromise;
  return mod?.default || mod;
};

/* ---------- helpers ---------- */

const isMobileDevice = () => {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod|android|mobile|phone/i.test(String(navigator.userAgent || ""));
};

/* ---------- printer config ---------- */

const getPrinterConfig = () => {
  try {
    return {
      ip: String(localStorage.getItem("lucia_printer_ip") || "").trim(),
      port: parseInt(localStorage.getItem("lucia_printer_port") || "9100", 10) || 9100,
      offsetX: parseInt(localStorage.getItem("lucia_printer_offset_x") || "0", 10) || 0,
    };
  } catch {
    return { ip: "", port: 9100, offsetX: 0 };
  }
};

const getApiBaseUrl = () => {
  try {
    const envUrl =
      typeof import.meta !== "undefined"
        ? import.meta.env?.VITE_DATA_API_BASE_URL
        : "";
    if (envUrl) return String(envUrl).replace(/\/+$/, "");

    const raw = localStorage.getItem("lucia_runtime_custom_config");
    if (raw) {
      const cfg = JSON.parse(raw);
      if (cfg.apiBaseUrl) return String(cfg.apiBaseUrl).replace(/\/+$/, "");
    }
  } catch {
    /* ignore */
  }
  return "";
};

/* ---------- label dimensions ---------- */

const LABEL_WIDTH_MM = 20;
const LABEL_HEIGHT_MM = 30;
const DPM = 8; // dots per mm at 203 DPI
const LW = LABEL_WIDTH_MM * DPM; // 160 dots
const LH = LABEL_HEIGHT_MM * DPM; // 240 dots

/* ---------- Render entire label on one high-res canvas ---------- */

const SCALE = 8; // 8× supersampling for sharp text; QR stays pixel-perfect

/**
 * Fit text into width, return { text, font } ready for fillText.
 */
const fitLine = (ctx, text, maxW, startSize, minSize) => {
  let txt = String(text);
  for (let sz = startSize; sz >= minSize; sz -= 1) {
    ctx.font = `bold ${sz}px Arial, Helvetica, sans-serif`;
    if (ctx.measureText(txt).width <= maxW) return { text: txt, font: ctx.font };
  }
  ctx.font = `bold ${minSize}px Arial, Helvetica, sans-serif`;
  while (txt.length > 1 && ctx.measureText(txt + "\u2026").width > maxW) txt = txt.slice(0, -1);
  return { text: txt + "\u2026", font: ctx.font };
};

const buildTsplPayload = async ({ invNumber, name, qrValue }) => {
  const QRCode = await getQRCodeModule();

  /* --- High-res canvas (SCALE×) --- */
  const cw = LW * SCALE; // 1280
  const ch = LH * SCALE; // 1920
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");

  // White background
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, cw, ch);
  ctx.fillStyle = "#000";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const margin = 6 * SCALE;

  // --- Name (top) ---
  const nameFit = fitLine(ctx, String(name || ""), cw - margin, 24 * SCALE, 10 * SCALE);
  ctx.font = nameFit.font;
  ctx.fillText(nameFit.text, cw / 2, 4 * SCALE);
  const nameBottom = 4 * SCALE + 28 * SCALE; // reserve ~28 dots for name line

  // --- QR code (center, rendered pixel-perfect then drawn at SCALE) ---
  const qrDots = Math.min(LW - 8, LH - 28 - 28 - 8); // max QR size in printer dots
  const qrPx = qrDots * SCALE; // pixel size on hi-res canvas
  const qrDataUrl = await QRCode.toDataURL(qrValue, {
    margin: 0,
    width: qrPx,
    errorCorrectionLevel: "M",
  });
  const qrImg = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = qrDataUrl;
  });
  const qrX = Math.round((cw - qrPx) / 2);
  const qrY = nameBottom + 2 * SCALE;
  // Crisp QR: disable smoothing
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrImg, qrX, qrY, qrPx, qrPx);
  ctx.imageSmoothingEnabled = true;

  // --- Inv number (bottom) ---
  const invFit = fitLine(ctx, `\u2116${invNumber}`, cw - margin, 20 * SCALE, 10 * SCALE);
  ctx.font = invFit.font;
  const invTextY = qrY + qrPx + 3 * SCALE;
  ctx.fillText(invFit.text, cw / 2, invTextY);

  /* --- Downsample to printer resolution & convert to 1-bit --- */
  const imgData = ctx.getImageData(0, 0, cw, ch);
  const px = imgData.data;
  const widthBytes = Math.ceil(LW / 8); // 20
  const bitmap = new Uint8Array(widthBytes * LH);
  const blockArea = SCALE * SCALE;

  for (let dy = 0; dy < LH; dy++) {
    for (let dx = 0; dx < LW; dx++) {
      let sum = 0;
      for (let sy = 0; sy < SCALE; sy++) {
        for (let sx = 0; sx < SCALE; sx++) {
          const si = ((dy * SCALE + sy) * cw + (dx * SCALE + sx)) * 4;
          sum += px[si] * 0.299 + px[si + 1] * 0.587 + px[si + 2] * 0.114;
        }
      }
      if (sum / blockArea < 140) {
        bitmap[dy * widthBytes + (dx >> 3)] |= 128 >> (dx & 7);
      }
    }
  }

  /* --- Single BITMAP TSPL command --- */
  const { offsetX } = getPrinterConfig();
  const bmpX = Math.max(0, offsetX); // configurable horizontal shift
  const enc = new TextEncoder();
  const header = enc.encode(
    `SIZE ${LABEL_WIDTH_MM} mm, ${LABEL_HEIGHT_MM} mm\r\n` +
    `GAP 2 mm, 0 mm\r\n` +
    `DIRECTION 1\r\n` +
    `CLS\r\n` +
    `BITMAP ${bmpX},0,${widthBytes},${LH},0,`
  );
  const footer = enc.encode(`\r\nPRINT 1,1\r\n`);

  const result = new Uint8Array(header.length + bitmap.length + footer.length);
  result.set(header, 0);
  result.set(bitmap, header.length);
  result.set(footer, header.length + bitmap.length);
  return result;
};

/* ---------- Uint8Array to base64 ---------- */

const uint8ToBase64 = (bytes) => {
  const chunks = [];
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK)));
  }
  return btoa(chunks.join(""));
};

/* ---------- silent print via server ---------- */

const trySilentPrint = async (tsplPayload) => {
  const apiBase = getApiBaseUrl();
  const { ip, port } = getPrinterConfig();

  if (!apiBase || !ip) return false;

  try {
    const res = await fetch(`${apiBase}/api/print-label`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: uint8ToBase64(tsplPayload),
        printerIp: ip,
        printerPort: port,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.warn("Silent print HTTP error:", res.status, body);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Silent print failed:", err);
    return false;
  }
};

/* ---------- browser print fallback (hidden iframe) ---------- */

const browserPrintLabel = async ({ invNumber, name, qrValue }) => {
  const QRCode = await getQRCodeModule();
  const qrDataUrl = await QRCode.toDataURL(qrValue, {
    margin: 1,
    width: 400,
    errorCorrectionLevel: "M",
  });

  const escapedName = String(name || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const escapedInv = String(invNumber || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const html = `<!doctype html><html lang="uk"><head><meta charset="UTF-8"><title>QR</title>
<style>
  @page { size: 20mm 30mm; margin: 0; }
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { width:20mm; height:30mm; }
  body { font-family: Arial, Helvetica, sans-serif; text-align:center; }
  .l { width:20mm; height:30mm; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:0.5mm 1mm; }
  .n { font-size:5pt; font-weight:700; line-height:1.15; word-break:break-all; max-height:4.5mm; overflow:hidden; }
  .q { width:14mm; height:14mm; margin:0.5mm 0; image-rendering:pixelated; }
  .i { font-size:5.5pt; font-weight:700; }
</style></head><body>
<div class="l">
  <div class="n">${escapedName}</div>
  <img class="q" src="${qrDataUrl}" />
  <div class="i">\u2116${escapedInv}</div>
</div>
<script>
  var img=document.querySelector('.q');
  function go(){window.focus();window.print();}
  img&&!img.complete?img.onload=go:setTimeout(go,80);
</script>
</body></html>`;

  if (isMobileDevice()) {
    const win = window.open("", "_blank");
    if (!win) {
      alert("Дозвольте pop-up у браузері для друку етикетки.");
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    return;
  }

  // Desktop: hidden iframe
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-9999px;top:0;width:0;height:0;border:none;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    throw new Error("Не вдалося створити фрейм друку");
  }

  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    try { document.body.removeChild(iframe); } catch { /* already removed */ }
  }, 10_000);
};

/* ---------- main export ---------- */

export const printAssetQrLabel = async ({ invNumber, name, qrValue }) => {
  const nInv = String(invNumber || "").trim();
  const nName = String(name || "").trim();
  const nQr = String(qrValue || nInv || nName || "").trim();

  if (!nInv || !nName || !nQr) {
    throw new Error("Для друку QR потрібні інвентарний номер і назва активу");
  }

  // 1) try silent print: full-label bitmap -> server -> raw TCP to printer
  try {
    const tspl = await buildTsplPayload({ invNumber: nInv, name: nName, qrValue: nQr });
    const ok = await trySilentPrint(tspl);
    if (ok) return;
  } catch (err) {
    console.warn("Silent TSPL print path failed:", err);
  }

  // 2) fallback: browser print dialog
  await browserPrintLabel({ invNumber: nInv, name: nName, qrValue: nQr });
};
