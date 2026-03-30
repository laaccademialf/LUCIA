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

/* ---------- TSPL native commands (rendered by printer at full DPI) ---------- */

/**
 * Truncate text to fit within maxDots width using the chosen TSPL font.
 * TSPL built-in font character widths (approximate):
 *   "1"=8, "2"=12, "3"=16, "4"=24, "5"=32  dots per char
 */
const FONT_WIDTHS = { 1: 8, 2: 12, 3: 16, 4: 24, 5: 32 };

const truncateForTspl = (text, font, maxDots) => {
  const cw = FONT_WIDTHS[font] || 16;
  const maxChars = Math.floor(maxDots / cw);
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(maxChars - 1, 1)) + "…";
};

const buildTsplPayload = ({ invNumber, name, qrValue }) => {
  /* Assume 203 DPI (8 dots/mm). Label = 160×240 dots.
     If printer is 300 DPI (≈12 dots/mm) the SIZE command in mm
     still works and QRCODE/TEXT scale automatically. */
  const dotsPerMm = 8; // 203 DPI
  const lw = LABEL_WIDTH_MM * dotsPerMm;   // 160

  // --- Name (top, font "2" = 12×20 per char) ---
  const nameFont = "2";
  const nameText = truncateForTspl(String(name || ""), nameFont, lw - 8);
  const nameCharW = FONT_WIDTHS[nameFont];
  const namePixelW = nameText.length * nameCharW;
  const nameX = Math.max(0, Math.round((lw - namePixelW) / 2));
  const nameY = 4;

  // --- QR code (center, native QRCODE command) ---
  const qrCellSize = 4; // dots per module, good balance size/scannability
  const qrY = nameY + 24; // below name line
  // Estimate QR width for centering (version auto, ~25 modules for short data)
  const qrModules = qrValue.length <= 17 ? 21 : qrValue.length <= 32 ? 25 : 29;
  const qrPixelW = qrModules * qrCellSize;
  const qrX = Math.max(0, Math.round((lw - qrPixelW) / 2));

  // --- Inv number (bottom, font "3" = 16×24 per char, bolder) ---
  const invFont = "3";
  const invText = truncateForTspl(`#${invNumber}`, invFont, lw - 8);
  const invCharW = FONT_WIDTHS[invFont];
  const invPixelW = invText.length * invCharW;
  const invX = Math.max(0, Math.round((lw - invPixelW) / 2));
  const invY = qrY + qrPixelW + 8;

  // Escape backslashes and quotes in data for TSPL
  const esc = (s) => s.replace(/\\/g, "\\[\\]").replace(/"/g, "\\[\"]");

  const tspl =
    `SIZE ${LABEL_WIDTH_MM} mm, ${LABEL_HEIGHT_MM} mm\r\n` +
    `GAP 2 mm, 0 mm\r\n` +
    `DIRECTION 1\r\n` +
    `CLS\r\n` +
    `TEXT ${nameX},${nameY},"${nameFont}",0,1,1,"${esc(nameText)}"\r\n` +
    `QRCODE ${qrX},${qrY},M,${qrCellSize},A,0,"${esc(qrValue)}"\r\n` +
    `TEXT ${invX},${invY},"${invFont}",0,1,1,"${esc(invText)}"\r\n` +
    `PRINT 1,1\r\n`;

  return new TextEncoder().encode(tspl);
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
