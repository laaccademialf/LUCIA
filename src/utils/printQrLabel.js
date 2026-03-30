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
    };
  } catch {
    return { ip: "", port: 9100 };
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

/* ---------- Render text line to 1-bit bitmap via canvas ---------- */

/**
 * Renders text at SCALE× resolution then downsamples to printer dots.
 * This produces much sharper 1-bit output than rendering at native 160px.
 * Returns { bytes: Uint8Array, widthBytes, width, height, x, y }
 */
const SCALE = 4; // render at 4× then downsample

const renderTextBitmap = (text, fontSize, maxWidthDots, yPos) => {
  const h = Math.ceil(fontSize * 1.3); // target height in printer dots
  const cw = maxWidthDots * SCALE;     // canvas width (high-res)
  const ch = h * SCALE;                // canvas height (high-res)
  const fz = fontSize * SCALE;         // font size (high-res)

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");

  // White background
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, cw, ch);

  // Fit text: shrink font until it fits
  let sz = fz;
  let txt = String(text);
  ctx.textBaseline = "top";
  ctx.textAlign = "center";

  const margin = 4 * SCALE;
  while (sz > 6 * SCALE) {
    ctx.font = `bold ${sz}px Arial, Helvetica, sans-serif`;
    if (ctx.measureText(txt).width <= cw - margin) break;
    sz -= SCALE;
  }
  // If still doesn't fit, truncate
  ctx.font = `bold ${sz}px Arial, Helvetica, sans-serif`;
  if (ctx.measureText(txt).width > cw - margin) {
    while (txt.length > 1 && ctx.measureText(txt + "\u2026").width > cw - margin) {
      txt = txt.slice(0, -1);
    }
    txt = txt + "\u2026";
  }

  ctx.fillStyle = "#000";
  ctx.fillText(txt, cw / 2, SCALE);

  // Downsample SCALE×SCALE blocks → 1 printer dot using area average
  const imgData = ctx.getImageData(0, 0, cw, ch);
  const px = imgData.data;
  const widthBytes = Math.ceil(maxWidthDots / 8);
  const bitmap = new Uint8Array(widthBytes * h);
  const blockArea = SCALE * SCALE;

  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < maxWidthDots; dx++) {
      // Average the SCALE×SCALE block of source pixels
      let sum = 0;
      for (let sy = 0; sy < SCALE; sy++) {
        for (let sx = 0; sx < SCALE; sx++) {
          const si = ((dy * SCALE + sy) * cw + (dx * SCALE + sx)) * 4;
          sum += px[si] * 0.299 + px[si + 1] * 0.587 + px[si + 2] * 0.114;
        }
      }
      const avg = sum / blockArea;
      if (avg < 160) { // slightly biased threshold for bolder text
        bitmap[dy * widthBytes + (dx >> 3)] |= 128 >> (dx & 7);
      }
    }
  }

  return { bytes: bitmap, widthBytes, width: maxWidthDots, height: h, x: 0, y: yPos };
};

/* ---------- Build TSPL: text as BITMAP, QR as native QRCODE ---------- */

const buildTsplPayload = ({ invNumber, name, qrValue }) => {
  const pad = 4; // dots padding from edges

  // --- Name bitmap (top) ---
  const nameBmp = renderTextBitmap(String(name || ""), 18, LW, pad);

  // --- QR code (native, centered) ---
  const qrCellSize = 3;
  const qrY = nameBmp.y + nameBmp.height + 2;
  const qrModulesEst = 29; // worst-case for centering
  const qrEstW = qrModulesEst * qrCellSize;
  const qrX = Math.max(0, Math.round((LW - qrEstW) / 2));

  // --- Inv number bitmap (bottom) ---
  const invY = qrY + qrEstW + 4;
  const invBmp = renderTextBitmap(`\u2116${invNumber}`, 16, LW, invY);

  // Build TSPL command sequence
  const enc = new TextEncoder();
  const cmds = enc.encode(
    `SIZE ${LABEL_WIDTH_MM} mm, ${LABEL_HEIGHT_MM} mm\r\n` +
    `GAP 2 mm, 0 mm\r\n` +
    `DIRECTION 1\r\n` +
    `CLS\r\n` +
    `BITMAP 0,${nameBmp.y},${nameBmp.widthBytes},${nameBmp.height},0,`
  );

  const afterName = enc.encode(
    `\r\nQRCODE ${qrX},${qrY},M,${qrCellSize},A,0,"${qrValue}"\r\n` +
    `BITMAP 0,${invBmp.y},${invBmp.widthBytes},${invBmp.height},0,`
  );

  const footer = enc.encode(`\r\nPRINT 1,1\r\n`);

  // Concatenate: header+BITMAP_cmd | name_bytes | afterName+BITMAP_cmd | inv_bytes | footer
  const parts = [cmds, nameBmp.bytes, afterName, invBmp.bytes, footer];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const result = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { result.set(p, off); off += p.length; }
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

  // 1) try silent print: native TSPL commands -> server -> raw TCP to printer
  try {
    const tspl = buildTsplPayload({ invNumber: nInv, name: nName, qrValue: nQr });
    const ok = await trySilentPrint(tspl);
    if (ok) return;
  } catch (err) {
    console.warn("Silent TSPL print path failed:", err);
  }

  // 2) fallback: browser print dialog
  await browserPrintLabel({ invNumber: nInv, name: nName, qrValue: nQr });
};
