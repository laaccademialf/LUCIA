// Простий QR-сканер на базі @zxing/browser
import React, { useRef, useEffect } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

export default function QRScanner({ onResult, onError }) {
  const videoRef = useRef(null);
  const codeReader = useRef(null);

  useEffect(() => {
    codeReader.current = new BrowserMultiFormatReader();
    let isMounted = true;
    codeReader.current
      .decodeFromVideoDevice(null, videoRef.current, (result, err) => {
        if (!isMounted) return;
        if (result) {
          onResult(result.getText());
        } else if (err && !(err instanceof NotFoundException)) {
          onError && onError(err);
        }
      });
    return () => {
      isMounted = false;
      codeReader.current.reset();
    };
  }, [onResult, onError]);

  return (
    <div>
      <video ref={videoRef} style={{ width: "100%", maxWidth: 320, borderRadius: 8 }} />
    </div>
  );
}
