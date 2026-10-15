import { publicFiles } from './public-files.js';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const allowed = new Set(publicFiles);
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json'
};
const port = Number(process.env.MEDISCHED_PORT || 5173);
http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost'),
        name = decodeURIComponent(url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
      if (!allowed.has(name)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const content = await readFile(path.join(root, name));
      res.writeHead(200, {
        'Content-Type': types[path.extname(name)] || 'text/plain',
        'Cache-Control': 'no-store'
      });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  })
  .listen(port, '127.0.0.1', () => console.log(`MediSched: http://127.0.0.1:${port}`));
