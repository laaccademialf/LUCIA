import * as QRCode from "qrcode";

export const printAssetQrLabel = async ({
  invNumber,
  name,
  qrValue,
}) => {
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
