// Static host for the exported FlyConnect UI (Next.js `output: 'export'` -> out/)
// Usage:  node static-serve.mjs   (serves ./out on http://localhost:3000)
// No Next runtime involved -> route 404s cannot happen.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('./out/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

createServer(async (req, res) => {
  let path = decodeURIComponent((req.url || '/').split('?')[0]);
  if (path.endsWith('/')) path += 'index.html';
  if (!extname(path)) path += '.html';

  const file = normalize(join(ROOT, path));
  if (!file.startsWith(normalize(ROOT))) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
}).listen(PORT, HOST, () => console.log(`Serve-FlyConnect http://${HOST}:${PORT} (root ${ROOT})`));
