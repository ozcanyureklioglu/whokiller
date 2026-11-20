// HTTP (statik dosyalar) + WebSocket sunucusunu birleştirir.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attachWebSocket } from './ws.js';
import { Rooms } from './rooms.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
// İnternetsiz kullanım için: `npm i three` yapılırsa Three.js buradan servis edilir.
const THREE_DIR = path.join(ROOT, 'node_modules', 'three', 'build');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function sendFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bulunamadı');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

function resolveRequest(pathname) {
  if (pathname.startsWith('/vendor/three/')) {
    const name = path.basename(pathname);
    if (!/^[\w.-]+\.js$/.test(name)) return null;
    return path.join(THREE_DIR, name);
  }
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return null; // dizin dışına çıkmayı engelle
  return file;
}

export function startServer({ port = 3000, host = '0.0.0.0', rooms: roomOpts } = {}) {
  const rooms = new Rooms(roomOpts);
  const server = http.createServer((req, res) => {
    let pathname;
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    if (pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }
    const file = resolveRequest(pathname);
    if (!file) {
      res.writeHead(403);
      res.end();
      return;
    }
    sendFile(res, file);
  });
  attachWebSocket(server, (conn) => rooms.handleConnection(conn));

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      resolve({
        server,
        rooms,
        port: server.address().port,
        close: () =>
          new Promise((r) => {
            rooms.close();
            server.close(() => r());
            server.closeAllConnections?.();
          }),
      });
    });
  });
}
