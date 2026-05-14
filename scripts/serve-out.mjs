import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "out");
const PORT = Number(process.env.PORT ?? 4321);

const MIME = {
  ".pdf": "application/pdf",
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

async function listDir(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (urlPath === "/" || urlPath === "/index.html") {
      const files = await listDir(ROOT);
      const links = files
        .map(
          (f) =>
            `<li><a href="/${encodeURIComponent(f)}" target="_blank">${f}</a></li>`,
        )
        .join("\n");
      const html = `<!doctype html><meta charset="utf-8">
<title>out/ — preview</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; color: #1f2937; }
  h1 { font-size: 18px; color: #287F73; }
  ul { line-height: 1.8; }
  a { color: #1B5E54; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .empty { color: #6b7280; font-style: italic; }
</style>
<h1>Pasta out/ — ${files.length} arquivo(s)</h1>
<ul>${files.length ? links : '<li class="empty">vazio</li>'}</ul>`;
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    const filePath = path.join(ROOT, urlPath);
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    const buf = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(buf);
  } catch (err) {
    res.writeHead(404);
    res.end("not found");
  }
});

server.listen(PORT, () => {
  console.log(`out/ servido em http://localhost:${PORT}/`);
});
