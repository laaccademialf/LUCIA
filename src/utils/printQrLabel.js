import * as QRCode from "qrcode";

export const printAssetQrLabel = async ({
  invNumber,
  name,
  qrValue,
}) => {
  const normalizedInvNumber = String(invNumber || "").trim();
  const normalizedName = String(name || "").trim();
  const valueToEncode = String(qrValue || normalizedInvNumber || normalizedName || "").trim();

  if (!normalizedInvNumber || !normalizedName || !valueToEncode) {
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
    </style>
  </head>
  <body>
    <div class="label">
      <div class="title">${normalizedName}</div>
      <div class="inv">Інв. №: ${normalizedInvNumber}</div>
      <img id="qr-img" class="qr" src="${qrDataUrl}" alt="QR ${normalizedInvNumber}" />
    </div>
  </body>
</html>
`;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const cleanup = () => {
    setTimeout(() => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    }, 800);
  };

  const frameWindow = iframe.contentWindow;
  const frameDoc = frameWindow?.document;
  if (!frameWindow || !frameDoc) {
    cleanup();
    throw new Error("Не вдалося ініціалізувати область друку");
  }

  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();

  const img = frameDoc.getElementById("qr-img");
  const startPrint = () => {
    setTimeout(() => {
      frameWindow.focus();
      frameWindow.print();
      cleanup();
    }, 120);
  };

  if (img && img.complete) {
    startPrint();
    return;
  }

  if (img) {
    img.onload = startPrint;
    img.onerror = () => {
      cleanup();
      console.error("Не вдалося завантажити QR зображення для друку");
    };
  } else {
    startPrint();
  }
};
