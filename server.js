// Simple static web server for "بازی کیان پوری" (Kianpori Game)
const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

const COMPRESSIBLE = new Set([".html", ".js", ".css", ".json", ".webmanifest", ".svg"]);
const REVALIDATE = new Set([".html", ".js", ".css", ".webmanifest", ".json"]);
const NO_CACHE = new Set([".png", ".jpg", ".jpeg", ".webp", ".ico"]);
const gzipCache = new Map();

function send(res, code, text) {
  res.writeHead(code, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function serveFile(req, res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, "404 Not Found");

    const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const headers = {
      "Content-Type": contentType,
      ETag: etag,
      "Last-Modified": stat.mtime.toUTCString(),
      "Accept-Ranges": "bytes",
      "Cache-Control": NO_CACHE.has(ext) ? "no-cache" : REVALIDATE.has(ext) ? "no-cache" : "public, max-age=604800",
      "X-Content-Type-Options": "nosniff",
    };

    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, headers);
      return res.end();
    }

    const range = req.headers.range;
    if (range && /^bytes=\d*-\d*$/.test(range)) {
      let [startStr, endStr] = range.replace("bytes=", "").split("-");
      let start, end;
      if (startStr === "") {
        const n = parseInt(endStr, 10);
        start = Math.max(stat.size - n, 0);
        end = stat.size - 1;
      } else {
        start = parseInt(startStr, 10);
        end = endStr === "" ? stat.size - 1 : Math.min(parseInt(endStr, 10), stat.size - 1);
      }
      if (!(start <= end) || start >= stat.size) {
        res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
        return res.end();
      }
      res.writeHead(206, {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Content-Length": end - start + 1,
      });
      if (req.method === "HEAD") return res.end();
      const stream = fs.createReadStream(filePath, { start, end });
      stream.on("error", () => res.destroy());
      return stream.pipe(res);
    }

    const wantsGzip = /\bgzip\b/.test(req.headers["accept-encoding"] || "");
    if (COMPRESSIBLE.has(ext) && wantsGzip) {
      const cached = gzipCache.get(filePath);
      const sendGz = (buf) => {
        res.writeHead(200, {
          ...headers,
          "Content-Encoding": "gzip",
          Vary: "Accept-Encoding",
          "Content-Length": buf.length,
        });
        res.end(req.method === "HEAD" ? undefined : buf);
      };
      if (cached && cached.etag === etag) return sendGz(cached.buf);
      return fs.readFile(filePath, (e, data) => {
        if (e) return res.destroy();
        zlib.gzip(data, { level: 9 }, (e2, buf) => {
          if (e2) return res.destroy();
          gzipCache.set(filePath, { etag, buf });
          sendGz(buf);
        });
      });
    }

    res.writeHead(200, { ...headers, "Content-Length": stat.size });
    if (req.method === "HEAD") return res.end();
    const stream = fs.createReadStream(filePath);
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  });
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method Not Allowed");

  let url;
  try {
    url = decodeURIComponent(req.url.split("?")[0]);
  } catch (e) {
    return send(res, 400, "Bad Request");
  }

  if (url === "/healthz") return send(res, 200, "ok");
  if (url.includes("\0")) return send(res, 400, "Bad Request");

  const safePath = path.normalize(path.join(PUBLIC_DIR, url));
  if (safePath !== PUBLIC_DIR && !safePath.startsWith(PUBLIC_DIR + path.sep)) {
    return send(res, 404, "404 Not Found");
  }

  fs.stat(safePath, (err, stat) => {
    if (!err && stat.isFile()) return serveFile(req, res, safePath);

    if (path.extname(url)) return send(res, 404, "404 Not Found");
    serveFile(req, res, path.join(PUBLIC_DIR, "index.html"));
  });
});

server.listen(PORT, () => {
  console.log(`Kianpori Game web server running on port ${PORT}`);
});
