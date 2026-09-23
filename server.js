// Simple static web server for "بازی کیان پوری" (Kianpori Game)
// Built to run on Railway (or any Node host). Zero npm dependencies —
// uses only Node's built-in http/fs modules, so `npm install` has
// nothing to fetch and nothing to break during deploy.
//
// Serves everything in /public and falls back to index.html for any
// unknown path, so the game loads no matter what URL a visitor hits
// on your custom domain.

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function send404(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("404 Not Found");
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return send404(res);

    const headers = { "Content-Type": contentType };
    // Never cache the HTML shell so deploys show up immediately;
    // cache everything else (images/audio/js/css) for a day.
    headers["Cache-Control"] = ext === ".html" ? "no-cache" : "public, max-age=86400";

    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);

  if (url === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  // Resolve the requested path safely inside PUBLIC_DIR (no path traversal).
  const safePath = path.normalize(path.join(PUBLIC_DIR, url));
  if (!safePath.startsWith(PUBLIC_DIR)) return send404(res);

  fs.stat(safePath, (err, stat) => {
    if (!err && stat.isFile()) {
      return serveFile(res, safePath);
    }
    // Any other route (including your bare domain root or a refresh
    // mid-game) still serves the game itself.
    serveFile(res, path.join(PUBLIC_DIR, "index.html"));
  });
});

server.listen(PORT, () => {
  console.log(`Kianpori Game web server running on port ${PORT}`);
});
