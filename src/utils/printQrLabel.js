/* ------------------------------------------------------------------ *
 *  printQrLabel – thermal-transfer network printer (ZPL, 20×30 mm)   *
 *                                                                     *
 *  Priority chain:                                                    *
 *    1. Print proxy  (any device → LAN proxy PC → printer)            *
 *    2. Server route (browser → server API → printer)                 *
 *    3. Browser print dialog (fallback HTML page)                     *
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
      proxyUrl: String(localStorage.getItem("lucia_print_proxy_url") || "http://localhost:6101").trim(),
    };
  } catch {
    return { ip: "", port: 9100, offsetX: 0, proxyUrl: "http://localhost:6101" };
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

/* ---------- Build ZPL payload (Zebra printer) ---------- */

const buildZplPayload = ({ invNumber, name, qrValue }) => {
  const { offsetX } = getPrinterConfig();
  const ox = Math.max(0, offsetX); // horizontal offset in dots

  // Truncate name to fit ~20mm at font size
  const maxNameChars = 18;
  let nameText = String(name || "");
  if (nameText.length > maxNameChars) nameText = nameText.slice(0, maxNameChars - 1) + "\u2026";

  const invText = `#${invNumber}`;

  // ZPL coordinates (203 DPI, label 160×240 dots)
  // Name: centered at top, font A, 20 dots high
  const nameH = 22;
  const nameW = 18;
  const nameY = 4;

  // QR: centered, magnification 3 (each module = 3 dots, ~63 dots for v2)
  const qrMag = 3;
  const qrY = nameY + nameH + 8;
  const qrX = ox + 16; // slight padding from left

  // Inv number: below QR
  const invH = 20;
  const invW = 16;
  const invY = qrY + 100; // QR ~90 dots + gap

  // ZPL uses ^FO (field origin), ^A (font), ^FD (field data)
  // ^BQ = QR barcode; N = normal; 2 = model 2; mag factor
  // ^CI28 = UTF-8 encoding for international chars
  const zpl =
    `^XA\n` +
    `^CI28\n` +
    `^PW${LW}\n` +
    `^LL${LH}\n` +
    // Name (top, centered using ^FB field block)
    `^FO${ox + 0},${nameY}^A0N,${nameH},${nameW}^FB${LW},1,0,C^FD${nameText}^FS\n` +
    // QR code
    `^FO${qrX},${qrY}^BQN,2,${qrMag}^FDMA,${qrValue}^FS\n` +
    // Inv number (bottom, centered)
    `^FO${ox + 0},${invY}^A0N,${invH},${invW}^FB${LW},1,0,C^FD${invText}^FS\n` +
    `^XZ\n`;

  return new TextEncoder().encode(zpl);
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

/* ---------- silent print via local proxy (same LAN as printer) ---------- */

const tryLocalProxyPrint = async (payload) => {
  const { ip, port, proxyUrl } = getPrinterConfig();

  if (!ip) { console.warn("Local proxy print skipped: no printer IP"); return false; }
  if (!proxyUrl) { console.warn("Local proxy print skipped: no proxy URL"); return false; }

  console.log(`Local proxy: ${proxyUrl}/print → ${ip}:${port} (${payload.length} bytes)`);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);

    const res = await fetch(`${proxyUrl}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: uint8ToBase64(payload),
        printerIp: ip,
        printerPort: port,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.warn("Local proxy HTTP error:", res.status, body);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Local proxy not available:", err.message || err);
    return false;
  }
};

/* ---------- silent print via server ---------- */

const trySilentPrint = async (payload) => {
  const apiBase = getApiBaseUrl();
  const { ip, port } = getPrinterConfig();

  if (!apiBase) { console.warn("Silent print skipped: no API base URL"); return false; }
  if (!ip) { console.warn("Silent print skipped: no printer IP configured"); return false; }

  console.log(`Silent print: ${apiBase}/api/print-label → ${ip}:${port} (${payload.length} bytes)`);

  try {
    const res = await fetch(`${apiBase}/api/print-label`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: uint8ToBase64(payload),
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

  const zpl = buildZplPayload({ invNumber: nInv, name: nName, qrValue: nQr });

  // 1) Print proxy: browser → LAN proxy → raw TCP to printer
  try {
    const ok = await tryLocalProxyPrint(zpl);
    if (ok) return;
    console.warn("Print proxy failed — trying server route");
  } catch (err) {
    console.warn("Print proxy error:", err);
  }

  // 2) Server route: browser → server API → raw TCP to printer
  try {
    const ok = await trySilentPrint(zpl);
    if (ok) return;
    console.warn("Server print returned false — falling back to browser print");
  } catch (err) {
    console.warn("Server ZPL print path failed:", err);
  }

  // 3) Fallback: browser print dialog
  await browserPrintLabel({ invNumber: nInv, name: nName, qrValue: nQr });
};
