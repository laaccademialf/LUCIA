import * as QRCode from "qrcode";
import JSZip from "jszip";

const isMobileDevice = () => {
  if (typeof navigator === "undefined") return false;
  const ua = String(navigator.userAgent || "").toLowerCase();
  return /iphone|ipad|ipod|android|mobile|phone/.test(ua);
};

const isAppleMobileDevice = () => {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(String(navigator.userAgent || ""));
};

const isAndroidDevice = () => {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(String(navigator.userAgent || ""));
};

const LBX_TEMPLATE_PUBLIC_PATH = "/brother-template.lbx";

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

const escapeXml = (value) => {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

const truncateWithEllipsis = (value, maxChars) => {
  const normalized = String(value || "").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
};

const getAdaptiveLbxTitleStyle = (name) => {
  const len = String(name || "").trim().length;

  if (len <= 18) {
    return { fontPt: 16.0, maxChars: 26, charLen: 56 };
  }
  if (len <= 26) {
    return { fontPt: 14.5, maxChars: 30, charLen: 60 };
  }
  if (len <= 36) {
    return { fontPt: 13.0, maxChars: 34, charLen: 64 };
  }

  return { fontPt: 11.8, maxChars: 38, charLen: 68 };
};

const fitSingleLineText = ({ ctx, text, maxWidth, startSize, minSize, fontWeight }) => {
  const normalized = String(text || "").trim();
  if (!normalized) {
    return { text: "", size: minSize };
  }

  for (let size = startSize; size >= minSize; size -= 2) {
    ctx.font = `${fontWeight} ${size}px Arial`;
    if (ctx.measureText(normalized).width <= maxWidth) {
      return { text: normalized, size };
    }
  }

  ctx.font = `${fontWeight} ${minSize}px Arial`;
  let next = normalized;
  while (next.length > 0 && ctx.measureText(`${next}...`).width > maxWidth) {
    next = next.slice(0, -1);
  }

  return { text: next ? `${next}...` : "...", size: minSize };
};

const generateBrotherLabelImage = async ({ invNumber, name, qrValue }) => {
  const normalizedInvNumber = String(invNumber || "").trim();
  const normalizedName = String(name || "").trim();
  const valueToEncode = String(qrValue || normalizedInvNumber || normalizedName || "").trim();

  if (!normalizedInvNumber || !normalizedName || !valueToEncode) {
    throw new Error("Для друку QR потрібні інвентарний номер і назва активу");
  }

  const qrDataUrl = await QRCode.toDataURL(valueToEncode, {
    margin: 0,
    width: 900,
    errorCorrectionLevel: "M",
  });

  const qrImage = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = qrDataUrl;
  });

  const canvas = document.createElement("canvas");
  // 24mm tape-friendly aspect: long horizontal label with minimal side padding.
  canvas.width = 1600;
  canvas.height = 620;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Не вдалося згенерувати зображення етикетки");
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#111827";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const adaptiveName = fitSingleLineText({
    ctx,
    text: normalizedName,
    maxWidth: canvas.width - 70,
    startSize: 54,
    minSize: 36,
    fontWeight: 600,
  });
  ctx.font = `600 ${adaptiveName.size}px Arial`;
  ctx.fillText(adaptiveName.text, canvas.width / 2, 16);

  const invY = 16 + adaptiveName.size + 8;
  ctx.font = "700 44px Arial";
  ctx.fillText(`No ${normalizedInvNumber}`, canvas.width / 2, invY);

  const qrSize = 430;
  const qrX = (canvas.width - qrSize) / 2;
  const qrY = invY + 54;
  ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

  const pngDataUrl = canvas.toDataURL("image/png");
  const pngBlob = await dataUrlToBlob(pngDataUrl);
  const fileName = `${sanitizeFileName(normalizedInvNumber)}-qr-label.png`;

  return { pngDataUrl, pngBlob, fileName };
};

const generateBrotherLbxFile = async ({ invNumber, name, qrValue, androidSafe = false }) => {
  const normalizedInvNumber = String(invNumber || "").trim();
  const normalizedName = String(name || "").trim();
  const valueToEncode = String(qrValue || normalizedInvNumber || normalizedName || "").trim();

  if (!normalizedInvNumber || !normalizedName || !valueToEncode) {
    throw new Error("Для LBX потрібні інвентарний номер і назва активу");
  }

  const response = await fetch(LBX_TEMPLATE_PUBLIC_PATH, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Не знайдено шаблон brother-template.lbx");
  }

  const templateBuffer = await response.arrayBuffer();
  const zip = await JSZip.loadAsync(templateBuffer);

  const labelXml = await zip.file("label.xml")?.async("string");
  const propXml = await zip.file("prop.xml")?.async("string");

  if (!labelXml || !propXml) {
    throw new Error("Шаблон LBX пошкоджений");
  }

  let nextLabelXml = labelXml
    .replace(
      /(<barcode:barcode[\s\S]*?<pt:data>)([\s\S]*?)(<\/pt:data>)/,
      `$1${escapeXml(valueToEncode)}$3`
    );

  if (androidSafe) {
    // Android Brother app is stricter with LBX text/style internals.
    // Keep template structure almost intact and inject only short text.
    const safeAndroidText = truncateWithEllipsis(`No ${normalizedInvNumber}`, 10);
    nextLabelXml = nextLabelXml.replace(
      /(<text:text[\s\S]*?<pt:data>)([\s\S]*?)(<\/pt:data>)/,
      `$1${escapeXml(safeAndroidText)}$3`
    );
  } else {
    const adaptiveLbx = getAdaptiveLbxTitleStyle(normalizedName);
    const safeName = truncateWithEllipsis(normalizedName, adaptiveLbx.maxChars);
    nextLabelXml = nextLabelXml
      .replace(
        /(<barcode:barcode[\s\S]*?<pt:objectStyle\s+x=")([^"]+)("\s+y=")([^"]+)("\s+width=")([^"]+)("\s+height=")([^"]+)("[\s\S]*?<\/pt:objectStyle>)/,
        `$147pt$330pt$529pt$729pt$9`
      )
      .replace(
        /(<text:text[\s\S]*?<pt:data>)([\s\S]*?)(<\/pt:data>)/,
        `$1${escapeXml(`${safeName}\nNo ${normalizedInvNumber}`)}$3`
      )
      .replace(
        /(<text:textControl[^>]*\s+autoLF=")([^"]+)("[^>]*>)/,
        `$1true$3`
      )
      .replace(
        /(<text:text[\s\S]*?<pt:objectStyle\s+x=")([^"]+)("\s+y=")([^"]+)("\s+width=")([^"]+)("\s+height=")([^"]+)("[\s\S]*?<\/pt:objectStyle>)/,
        `$112.1pt$38.8pt$6106.3pt$722.4pt$9`
      )
      .replace(
        /(<text:textAlign[^>]*\s+verticalAlignment=")([^"]+)("[^>]*>)/,
        `$1TOP$3`
      )
      .replace(
        /(<text:fontExt[^>]*\s+size=")([^"]+)("[^>]*>)/,
        `$1${adaptiveLbx.fontPt.toFixed(1)}pt$3`
      )
      .replace(
        /(<text:stringItem[^>]*\s+charLen=")([^"]+)("[^>]*>)/,
        `$1${adaptiveLbx.charLen}$3`
      );
  }

  const nextPropXml = propXml
    .replace(/(<dc:title>)([\s\S]*?)(<\/dc:title>)/, `$1${escapeXml(`LUCIA_${normalizedInvNumber}`)}$3`)
    .replace(/(<dcterms:modified>)([\s\S]*?)(<\/dcterms:modified>)/, `$1${new Date().toISOString()}$3`);

  zip.file("label.xml", nextLabelXml);
  zip.file("prop.xml", nextPropXml);

  const lbxBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const lbxFileName = `${sanitizeFileName(normalizedInvNumber)}-label.lbx`;

  return { lbxBlob, lbxFileName };
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

const tryOpenBrotherApp = () => {
  if (isAndroidDevice()) {
    // Use direct scheme link to avoid forced Play Store fallback when package/activity matching fails.
    window.location.href = "brotheriprintandlabel://";
    return;
  }

  window.location.href = "brotheriprintandlabel://";
};

const shareBrotherFileDirect = async ({ blob, fileName, mimeType }) => {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
    return false;
  }

  try {
    const files = [new File([blob], fileName, { type: mimeType })];

    if (typeof navigator.canShare === "function" && !navigator.canShare({ files })) {
      return false;
    }

    await navigator.share({ files });
    return true;
  } catch {
    return false;
  }
};

export const printAssetQrLabel = async ({
  invNumber,
  name,
  qrValue,
}) => {
  if (isMobileDevice()) {
    const isAndroid = isAndroidDevice();

    const generated = await generateBrotherLabelImage({ invNumber, name, qrValue });

    try {
      const lbxGenerated = await generateBrotherLbxFile({ invNumber, name, qrValue, androidSafe: isAndroid });

      if (isAndroid) {
        const lbxShared = await shareBrotherFileDirect({
          blob: lbxGenerated.lbxBlob,
          fileName: lbxGenerated.lbxFileName,
          mimeType: "application/octet-stream",
        });
        if (lbxShared) {
          return;
        }

        downloadBlob(lbxGenerated.lbxBlob, lbxGenerated.lbxFileName);
        alert("LBX завантажено. Якщо Brother не з'явився в Поділитись, відкрийте файл у Downloads і поділіться з iPrint&Label.");
        return;
      }

      if (isAppleMobileDevice()) {
        // iOS often hides Brother in Web Share targets for LBX; Files -> Brother works reliably.
        downloadBlob(lbxGenerated.lbxBlob, lbxGenerated.lbxFileName);
        alert("LBX завантажено. Натисніть файл внизу Safari -> Поділитись -> iPrint&Label. Це найстабільніший сценарій на iPhone.");
        return;
      }

      const lbxShared = await shareBrotherFileDirect({
        blob: lbxGenerated.lbxBlob,
        fileName: lbxGenerated.lbxFileName,
        mimeType: "application/octet-stream",
      });
      if (lbxShared) {
        return;
      }

      downloadBlob(lbxGenerated.lbxBlob, lbxGenerated.lbxFileName);
      tryOpenBrotherApp();
      alert("LBX завантажено. Відкрийте Brother iPrint&Label і імпортуйте файл з Downloads/Files.");
      return;
    } catch (error) {
      console.warn("LBX generation/share skipped:", error);
    }

    const shared = await shareBrotherFileDirect({
      blob: generated.pngBlob,
      fileName: generated.fileName,
      mimeType: "image/png",
    });

    if (!shared) {
      alert("Не вдалося відкрити меню Поділитись у браузері. Відкрийте цю сторінку в мобільному Chrome/Safari і натисніть QR ще раз.");
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
