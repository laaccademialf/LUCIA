#!/usr/bin/env node
/* ------------------------------------------------------------------ *
 *  LUCIA Print Proxy – легкий локальний проксі для друку етикеток    *
 *  Запускайте на тому ж ПК, де відкритий браузер:                    *
 *    node print-proxy.js                                             *
 *  або з custom портом:                                              *
 *    node print-proxy.js --port 6101                                 *
 *                                                                     *
 *  Браузер (luci.lafamiglia.ua) → localhost:6101 → TCP → принтер     *
 *  Zero dependencies — тільки Node.js >= 18                          *
 * ------------------------------------------------------------------ */

import http from "node:http";
import net from "node:net";

/* ---------- CLI args ---------- */
const args = process.argv.slice(2);
let PORT = 6101;
const portIdx = args.indexOf("--port");
if (portIdx !== -1 && args[portIdx + 1]) {
  PORT = parseInt(args[portIdx + 1], 10) || 6101;
}

/* ---------- CORS ---------- */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

/* ---------- helpers ---------- */
const sendJson = (res, status, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(status, { ...corsHeaders, "Content-Type": "application/json" });
  res.end(body);
};

const parseBody = (req, maxBytes = 2 * 1024 * 1024) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(new Error("Body too large"));
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });

/* ---------- TCP send to printer ---------- */
const sendToPrinter = (printerIp, printerPort, buffer, timeoutMs = 10_000) =>
  new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.connect(printerPort, printerIp, () => {
      socket.write(buffer, () => {
        socket.end();
        resolve();
      });
    });
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error(`Printer timeout (${printerIp}:${printerPort})`));
    });
    socket.on("error", (err) => reject(err));
  });

/* ---------- HTTP server ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    return res.end();
  }

  // Health check
  if (url.pathname === "/health" && req.method === "GET") {
    return sendJson(res, 200, { ok: true, service: "lucia-print-proxy" });
  }

  // Print endpoint
  if (url.pathname === "/print" && req.method === "POST") {
    try {
      const body = await parseBody(req);
      const { data, printerIp, printerPort } = body;

      if (!data || !printerIp) {
        return sendJson(res, 400, { ok: false, error: "Missing data or printerIp" });
      }

      const ip = String(printerIp).trim();
      const port = Number(printerPort) || 9100;

      // Validate IP format (basic check)
      if (!/^[\d.]+$/.test(ip) && !/^[a-zA-Z0-9._-]+$/.test(ip)) {
        return sendJson(res, 400, { ok: false, error: "Invalid printer IP" });
      }

      const buffer = Buffer.from(data, "base64");
      console.log(`[print] → ${ip}:${port} (${buffer.length} bytes)`);

      await sendToPrinter(ip, port, buffer);

      console.log(`[print] ✓ OK`);
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error(`[print] ✗ ${err.message}`);
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  }

  sendJson(res, 404, { ok: false, error: "Not found" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  🖨️  LUCIA Print Proxy запущено на http://localhost:${PORT}`);
  console.log(`  Ендпоінт друку:  POST http://localhost:${PORT}/print`);
  console.log(`  Health check:    GET  http://localhost:${PORT}/health\n`);
});
