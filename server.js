#!/usr/bin/env node
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const ROOT_DIR = path.resolve(__dirname);
const CORS_ENABLED = false;

/**
 * Basic MIME type lookup table so Cesium assets are served with the right headers.
 */
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".bin": "application/octet-stream",
  ".xml": "application/xml; charset=utf-8",
  ".czml": "application/json; charset=utf-8",
  ".pnts": "application/octet-stream",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function sendError(res, status, message) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(message);
}

function resolveFilePath(urlPath) {
  const decodedPath = decodeURIComponent(urlPath);
  const normalized = path.normalize(decodedPath).replace(/^\/+/, "");
  return path.join(ROOT_DIR, normalized);
}

function streamFile(filePath, res, stat) {
  const ext = path.extname(filePath);
  const mimeType = MIME_TYPES[ext] || "application/octet-stream";

  const headers = {
    "Content-Type": mimeType,
    "Content-Length": stat.size,
    "Cache-Control": "no-cache",
  };

  if (CORS_ENABLED) {
    headers["Access-Control-Allow-Origin"] = "*";
  }

  res.writeHead(200, headers);
  const stream = fs.createReadStream(filePath);
  stream.on("error", (err) => {
    console.error(`Error streaming ${filePath}`, err);
    if (!res.headersSent) {
      sendError(res, 500, "Internal server error");
    } else {
      res.destroy();
    }
  });
  stream.pipe(res);
}

function renderHtml(raw) {
  const token = process.env.CESIUM_ION_TOKEN || "";
  return raw.replace(/__CESIUM_ION_TOKEN__/g, token);
}

function serveHtmlFile(filePath, res) {
  fs.readFile(filePath, "utf8", (err, raw) => {
    if (err) {
      console.error("Unable to read", filePath, err);
      sendError(res, 500, "Failed to read HTML file");
      return;
    }

    const headers = {
      "Content-Type": MIME_TYPES[".html"],
      "Cache-Control": "no-cache",
    };

    if (CORS_ENABLED) {
      headers["Access-Control-Allow-Origin"] = "*";
    }

    res.writeHead(200, headers);
    res.end(renderHtml(raw));
  });
}

function serveIndex(res) {
  const indexPath = path.join(ROOT_DIR, "index.html");
  serveHtmlFile(indexPath, res);
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    let filePath = resolveFilePath(url.pathname);

    if (!filePath.startsWith(ROOT_DIR)) {
      sendError(res, 403, "Forbidden");
      return;
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      serveIndex(res);
      return;
    }

    fs.stat(filePath, (err, stat) => {
      if (err) {
      if (err.code === "ENOENT" && url.pathname.endsWith("/")) {
          const nestedIndex = path.join(filePath, "index.html");
          fs.stat(nestedIndex, (innerErr, innerStat) => {
            if (innerErr) {
              sendError(res, 404, "Not found");
            } else {
              serveHtmlFile(nestedIndex, res);
            }
          });
        } else {
          sendError(res, 404, "Not found");
        }
        return;
      }

      if (stat.isDirectory()) {
        const nestedIndex = path.join(filePath, "index.html");
        fs.stat(nestedIndex, (innerErr, innerStat) => {
          if (innerErr) {
            sendError(res, 403, "Directory listing not permitted");
          } else {
            serveHtmlFile(nestedIndex, res);
          }
        });
        return;
      }

      const ext = path.extname(filePath);
      if (ext === ".html") {
        serveHtmlFile(filePath, res);
        return;
      }

      streamFile(filePath, res, stat);
    });
  } catch (err) {
    console.error("Request error", err);
    sendError(res, 500, "Internal server error");
  }
});

server.listen(PORT, () => {
  console.log(`MPACT demo running at http://localhost:${PORT}`);
  console.log('  • Asteroid catalog: /');
  console.log('  • Meteor impact:   /meteor.html');
  if (process.env.CESIUM_ION_TOKEN) {
    console.log("Cesium Ion token detected; premium imagery and terrain enabled.");
  } else {
    console.log(
      "No CESIUM_ION_TOKEN detected; the viewer will fall back to public imagery."
    );
  }
});
