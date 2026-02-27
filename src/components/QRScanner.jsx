// Простий QR-сканер на базі @zxing/browser
import React, { useRef, useEffect, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

export default function QRScanner({ onResult, onError }) {
  const videoRef = useRef(null);
  const codeReader = useRef(null);
  const controlsRef = useRef(null);
  const [statusText, setStatusText] = useState("Запуск камери...");

  useEffect(() => {
    codeReader.current = new BrowserMultiFormatReader();
    let stopped = false;

    const handleDecode = (result, err) => {
      if (stopped) return;
      try {
        if (result) {
          stopped = true;
          onResult(result.getText());
          controlsRef.current?.stop();
          controlsRef.current = null;
          return;
        }

        if (err && err.name !== "NotFoundException") {
          console.error("QR decode error:", err);
        }
      } catch (callbackError) {
        console.error("QR scanner callback error:", callbackError);
        onError && onError(callbackError);
      }
    };

    const start = async () => {
      if (!videoRef.current) return;

      try {
        setStatusText("Запит доступу до камери...");
        controlsRef.current = await codeReader.current.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          handleDecode
        );
        setStatusText("Наведіть камеру на QR код");
      } catch (error) {
        setStatusText("Не вдалося запустити камеру");
        onError && onError(error);
      }
    };

    start();

    return () => {
      stopped = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
      codeReader.current = null;
    };
  }, [onResult, onError]);

  return (
    <div className="space-y-2">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ width: "100%", maxWidth: 360, minHeight: 260, borderRadius: 8, backgroundColor: "#000", objectFit: "cover" }}
      />
      <div className="text-xs text-slate-600">{statusText}</div>
    </div>
  );
}
