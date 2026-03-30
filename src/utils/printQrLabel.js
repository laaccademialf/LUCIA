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

/* ---------- CP1251 encoding for Cyrillic ---------- */

const CP1251_MAP = (() => {
  const m = new Map();
  // Ukrainian/Russian Cyrillic block mapped to CP1251 bytes
  const ranges = [
    [0x0410, 0x042F, 0xC0], // А-Я → 0xC0-0xDF
    [0x0430, 0x044F, 0xE0], // а-я → 0xE0-0xFF
  ];
  for (const [from, to, base] of ranges) {
    for (let cp = from; cp <= to; cp++) m.set(cp, base + (cp - from));
  }
  // Individual mappings for Ukrainian letters
  m.set(0x0401, 0xA8); // Ё
  m.set(0x0451, 0xB8); // ё
  m.set(0x0404, 0xAA); // Є
  m.set(0x0454, 0xBA); // є
  m.set(0x0406, 0xB2); // І
  m.set(0x0456, 0xB3); // і
  m.set(0x0407, 0xAF); // Ї
  m.set(0x0457, 0xBF); // ї
  m.set(0x0490, 0xA5); // Ґ
  m.set(0x0491, 0xB4); // ґ
  m.set(0x2116, 0xB9); // №
  return m;
})();

/** Encode string to CP1251 byte array (ASCII passthrough, Cyrillic mapped, unknown → '?') */
const toCP1251 = (str) => {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const cp = str.charCodeAt(i);
    if (cp < 0x80) {
      bytes.push(cp);
    } else {
      bytes.push(CP1251_MAP.get(cp) || 0x3F); // '?' for unknown
    }
  }
  return new Uint8Array(bytes);
};

/* ---------- TSPL native commands (rendered by printer at full DPI) ---------- */

const FONT_WIDTHS = { 1: 8, 2: 12, 3: 16, 4: 24, 5: 32 };

const truncateForTspl = (text, font, maxDots) => {
  const cw = FONT_WIDTHS[font] || 16;
  const maxChars = Math.floor(maxDots / cw);
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(maxChars - 1, 1));
};

const buildTsplPayload = ({ invNumber, name, qrValue }) => {
  /* 203 DPI = 8 dots/mm. Label 20×30mm = 160×240 dots. */
  const dotsPerMm = 8;
  const lw = LABEL_WIDTH_MM * dotsPerMm; // 160

  // --- Name (top, font "2" = 12×20 per char, 1 CP1251 byte = 1 glyph) ---
  const nameFont = "2";
  const nameText = truncateForTspl(String(name || ""), nameFont, lw - 8);
  const nameBytes = toCP1251(nameText);
  const nameCharW = FONT_WIDTHS[nameFont];
  const namePixelW = nameBytes.length * nameCharW; // count BYTES not JS chars
  const nameX = Math.max(0, Math.round((lw - namePixelW) / 2));
  const nameY = 4;

  // --- QR code (centered, cell size 3 for 20mm label) ---
  const qrCellSize = 3;
  const qrY = nameY + 24;
  // QR version auto-selected: v1=21, v2=25, v3=29 modules
  // Use worst case (29) for centering — small offset is better than left-bias
  const qrEstW = 29 * qrCellSize; // 87 dots max estimate
  const qrX = Math.max(0, Math.round((lw - qrEstW) / 2));

  // --- Inv number (bottom, font "2") ---
  const invFont = "2";
  const invPrefix = "#";
  const invText = truncateForTspl(invPrefix + invNumber, invFont, lw - 8);
  const invBytes = toCP1251(invText);
  const invCharW = FONT_WIDTHS[invFont];
  const invPixelW = invBytes.length * invCharW;
  const invX = Math.max(0, Math.round((lw - invPixelW) / 2));
  const invY = qrY + qrEstW + 8;

  // Build TSPL as raw bytes: header (ASCII) + text fields (CP1251)
  const enc = new TextEncoder();
  const header = enc.encode(
    `SIZE ${LABEL_WIDTH_MM} mm, ${LABEL_HEIGHT_MM} mm\r\n` +
    `GAP 2 mm, 0 mm\r\n` +
    `DIRECTION 1\r\n` +
    `CODEPAGE 1251\r\n` +
    `CLS\r\n`
  );

  const nameCmd = enc.encode(`TEXT ${nameX},${nameY},"${nameFont}",0,1,1,"`);
  const nameTail = enc.encode(`"\r\n`);

  const qrLine = enc.encode(
    `QRCODE ${qrX},${qrY},M,${qrCellSize},A,0,"${qrValue}"\r\n`
  );

  const invCmd = enc.encode(`TEXT ${invX},${invY},"${invFont}",0,1,1,"`);
  const invTail = enc.encode(`"\r\n`);

  const footer = enc.encode(`PRINT 1,1\r\n`);

  // Concatenate: header + TEXT"<cp1251>" + QR + TEXT"<cp1251>" + PRINT
  const parts = [header, nameCmd, nameBytes, nameTail, qrLine, invCmd, invBytes, invTail, footer];
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
