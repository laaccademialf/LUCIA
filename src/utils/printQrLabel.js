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

const getPrinterConfig = (overrides) => {
  try {
    return {
      ip: String(overrides?.printerIp || overrides?.printer_ip || localStorage.getItem("lucia_printer_ip") || "").trim(),
      port: parseInt(overrides?.printerPort || overrides?.printer_port || localStorage.getItem("lucia_printer_port") || "9100", 10) || 9100,
      offsetX: parseInt(overrides?.printerOffsetX || overrides?.printer_offset_x || localStorage.getItem("lucia_printer_offset_x") || "0", 10) || 0,
      proxyUrl: String(overrides?.printerProxyUrl || overrides?.printer_proxy_url || localStorage.getItem("lucia_print_proxy_url") || "http://localhost:6101").trim(),
    };
  } catch {
    return { ip: "", port: 9100, offsetX: 0, proxyUrl: "http://localhost:6101" };
  }
};

const normalizeApiBase = (value) => String(value || "").replace(/\/+$/, "").replace(/\/api$/i, "");

const getApiBaseUrl = () => {
  try {
    const envUrl =
      typeof import.meta !== "undefined"
        ? import.meta.env?.VITE_DATA_API_BASE_URL
        : "";
    if (envUrl) return normalizeApiBase(envUrl);

    const raw = localStorage.getItem("lucia_runtime_custom_config");
    if (raw) {
      const cfg = JSON.parse(raw);
      if (cfg.apiBaseUrl) return normalizeApiBase(cfg.apiBaseUrl);
    }
  } catch {
    /* ignore */
  }
  return "";
};

const getPrintAuthHeaders = () => {
  const headers = { "Content-Type": "application/json" };

  try {
    const sessionToken = String(localStorage.getItem("lucia_auth_session_token") || "").trim();
    if (sessionToken) {
      headers["x-session-token"] = sessionToken;
      headers.Authorization = `Bearer ${sessionToken}`;
    }

    const rawRuntimeConfig = localStorage.getItem("lucia_runtime_custom_config");
    if (!rawRuntimeConfig) return headers;

    const runtimeConfig = JSON.parse(rawRuntimeConfig);
    const apiToken = String(runtimeConfig?.token || "").trim();
    if (apiToken) {
      headers["x-api-token"] = apiToken;
      if (!headers.Authorization) {
        headers.Authorization = `Bearer ${apiToken}`;
      }
    }
  } catch {
    // Ignore storage/auth header resolution errors and fallback to bare request.
  }

  return headers;
};

/* ---------- label dimensions ---------- */

const LABEL_WIDTH_MM = 20;
const LABEL_HEIGHT_MM = 30;
const DPM = 8; // dots per mm at 203 DPI
const LW = LABEL_WIDTH_MM * DPM; // 160 dots
const LH = LABEL_HEIGHT_MM * DPM; // 240 dots

/* ---------- Build ZPL payload (Zebra printer) ---------- */
/* Label 30×20 mm landscape (240×160 dots at 203 DPI)      */

const buildZplPayload = ({ invNumber, name, qrValue, printerConfig }) => {
  const { offsetX } = printerConfig || getPrinterConfig();
  const ox = Math.max(0, offsetX);

  // Landscape: width = 30mm (240 dots), height = 20mm (160 dots)
  const PW = LH; // 240 dots (30mm)
  const LL = LW; // 160 dots (20mm)

  const invText = `#${invNumber}`;
  const nameText = String(name || "");

  // Layout: QR on the left, text on the right
  // QR: magnification 3, ~69 dots (21 modules + 2 quiet zone × 3)
  const qrMag = 3;
  const qrSize = 75; // approximate QR block size with quiet zone
  const qrX = ox + 16; // ~2mm left margin so the QR is not clipped off the edge
  const qrY = 20; // slightly below top edge

  // Text area: right of QR
  const textX = qrX + qrSize + 4;
  const textW = PW - textX - 2; // remaining width for text

  // Name: multi-line, font with line gap to prevent overlap
  const nameH = 15;
  const nameW = 14;
  const nameMaxLines = 4;
  const nameLineGap = 6; // extra spacing between lines
  const nameY = 6;

  // Inv number: below name with extra gap for long names
  const invH = 18;
  const invW = 16;
  const invY = nameY + (nameH + nameLineGap) * nameMaxLines + 10;

  const zpl =
    `^XA\n` +
    `^CI28\n` +
    `^PW${PW}\n` +
    `^LL${LL}\n` +
    // QR code (left, near top)
    `^FO${qrX},${qrY}^BQN,2,${qrMag}^FDMA,${qrValue}^FS\n` +
    // Name (right of QR, up to 3 lines with gap)
    `^FO${textX},${nameY}^A0N,${nameH},${nameW}^FB${textW},${nameMaxLines},${nameLineGap},L^FD${nameText}^FS\n` +
    // Inv number (right of QR, below name)
    `^FO${textX},${invY}^A0N,${invH},${invW}^FB${textW},1,0,L^FD${invText}^FS\n` +
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

const tryLocalProxyPrint = async (payload, printerConfig) => {
  const { ip, port, proxyUrl } = printerConfig || getPrinterConfig();

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

const trySilentPrint = async (payload, printerConfig) => {
  const apiBase = getApiBaseUrl();
  const { ip, port } = printerConfig || getPrinterConfig();

  if (!apiBase) { console.warn("Silent print skipped: no API base URL"); return false; }
  if (!ip) { console.warn("Silent print skipped: no printer IP configured"); return false; }

  console.log(`Silent print: ${apiBase}/api/print-label → ${ip}:${port} (${payload.length} bytes)`);

  try {
    const res = await fetch(`${apiBase}/api/print-label`, {
      method: "POST",
      headers: getPrintAuthHeaders(),
      credentials: "include",
      body: JSON.stringify({
        data: uint8ToBase64(payload),
        printerIp: ip,
        printerPort: port,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.warn("Silent print HTTP error:", res.status, body);
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return true;
  } catch (err) {
    console.warn("Silent print failed:", err);
    throw err;
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

export const printAssetQrLabel = async ({ invNumber, name, qrValue, restaurant }) => {
  const nInv = String(invNumber || "").trim();
  const nName = String(name || "").trim();
  const nQr = String(qrValue || nInv || nName || "").trim();

  if (!nInv || !nName || !nQr) {
    throw new Error("Для друку QR потрібні інвентарний номер і назва активу");
  }

  // Printer config: restaurant fields > localStorage fallback
  const cfg = getPrinterConfig(restaurant);
  const zpl = buildZplPayload({ invNumber: nInv, name: nName, qrValue: nQr, printerConfig: cfg });

  const reasons = [];

  // 1) Server route: browser → server API → raw TCP to printer
  try {
    const ok = await trySilentPrint(zpl, cfg);
    if (ok) return;
  } catch (err) {
    reasons.push(`Сервер: ${err.message || err}`);
    console.warn("Server print failed:", err);
    if (Number(err?.status) === 401 || Number(err?.status) === 403 || /unauthorized/i.test(String(err?.message || ""))) {
      throw err;
    }
  }

  // 2) Print proxy: browser → LAN proxy → raw TCP to printer
  try {
    const ok = await tryLocalProxyPrint(zpl, cfg);
    if (ok) return;
  } catch (err) {
    reasons.push(`Proxy: ${err.message || err}`);
    console.warn("Print proxy failed:", err);
  }

  // 3) Якщо IP принтера задано, але обидва шляхи впали — показуємо причину
  if (cfg.ip) {
    throw new Error(
      `Не вдалося відправити на принтер ${cfg.ip}:${cfg.port}. ${reasons.join(" | ") || "Невідома причина"}`
    );
  }

  // 4) Fallback: браузерний діалог (коли IP принтера не налаштовано)
  await browserPrintLabel({ invNumber: nInv, name: nName, qrValue: nQr });
};

/* ---------- batch print (all filtered assets) ---------- */

export const printBatchQrLabels = async (assets, { onProgress, restaurant } = {}) => {
  if (!Array.isArray(assets) || assets.length === 0) {
    throw new Error("Немає активів для друку");
  }

  const cfg = getPrinterConfig(restaurant);
  if (!cfg.ip) {
    throw new Error("IP принтера не налаштовано. Задайте IP у налаштуваннях ресторану або з'єднаннях БД.");
  }

  const results = { success: 0, failed: 0, errors: [] };

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    const invNumber = String(asset.invNumber || asset.inv_number || "").trim();
    const name = String(asset.name || "").trim();
    const qrValue = String(asset.qrCode || asset.qr_code || invNumber || "").trim();

    if (!invNumber || !name) {
      results.failed++;
      results.errors.push(`#${i + 1}: немає інв. номера або назви`);
      continue;
    }

    try {
      const zpl = buildZplPayload({ invNumber, name, qrValue, printerConfig: cfg });

      let printed = false;
      try { printed = await trySilentPrint(zpl, cfg); } catch { /* ignore */ }
      if (!printed) {
        try { printed = await tryLocalProxyPrint(zpl, cfg); } catch { /* ignore */ }
      }
      if (!printed) {
        results.failed++;
        results.errors.push(`#${invNumber}: не вдалося надіслати на принтер`);
        continue;
      }

      results.success++;
    } catch (err) {
      results.failed++;
      results.errors.push(`#${invNumber}: ${err.message}`);
    }

    if (onProgress) onProgress(i + 1, assets.length);

    // Small delay between labels to avoid overwhelming the printer
    if (i < assets.length - 1) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return results;
};
