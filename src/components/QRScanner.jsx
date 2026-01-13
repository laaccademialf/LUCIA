// Простий QR-сканер на базі @zxing/browser
import React, { useRef, useEffect } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { NotFoundException } from "@zxing/library";

export default function QRScanner({ onResult, onError }) {
  const videoRef = useRef(null);
  const codeReader = useRef(null);

  useEffect(() => {
    codeReader.current = new BrowserMultiFormatReader();
    let stopped = false;
    let resetOnce = false;
    codeReader.current.decodeFromVideoDevice(null, videoRef.current, (result, err) => {
      if (stopped) return;
      if (result) {
        stopped = true;
        onResult(result.getText());
        if (!resetOnce) {
          codeReader.current.reset();
          resetOnce = true;
        }
      } else if (err && !(err instanceof NotFoundException)) {
        onError && onError(err);
      }
    });
    return () => {
      stopped = true;
      if (!resetOnce) {
        codeReader.current.reset();
        resetOnce = true;
      }
    };
  }, [onResult, onError]);

  return (
    <div>
      <video ref={videoRef} style={{ width: "100%", maxWidth: 320, borderRadius: 8 }} />
    </div>
  );
}
