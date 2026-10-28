// Serves ./out under /Aa like GitHub Pages (resolves /x to x.html): node scripts/serve-pages.cjs 3200
const http = require("http"), fs = require("fs"), path = require("path");
const root = path.resolve("out"), base = "/Aa", port = Number(process.argv[2] || 3200);
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".woff": "font/woff", ".woff2": "font/woff2", ".txt": "text/plain", ".svg": "image/svg+xml" };
http.createServer((req, res) => {
  let u = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (!u.startsWith(base)) { res.writeHead(404); return res.end("not found"); }
  u = u.slice(base.length) || "/";
  for (const c of [u, u + ".html", path.join(u, "index.html")]) {
    const f = path.join(root, c);
    if (f.startsWith(root) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" });
      return fs.createReadStream(f).pipe(res);
    }
  }
  res.writeHead(404, { "content-type": "text/html" });
  fs.createReadStream(path.join(root, "404.html")).pipe(res);
}).listen(port, () => console.log("serving", port));
