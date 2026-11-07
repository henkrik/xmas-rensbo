import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

const rootDir = process.cwd();
const docsDir = path.join(rootDir, 'docs');
const port = Number(process.env.PORT) || 8080;

// Build docs/ first so it's immediately ready to serve
execSync('node scripts/export-docs.mjs', { stdio: 'inherit' });

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const urlPath = (req.url || '/').split('?')[0];
  const relPath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const filePath = path.join(docsDir, relPath);

  // Prevent path traversal outside docs/
  if (!filePath.startsWith(docsDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  });
  res.end(fs.readFileSync(filePath));
});

function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      const isIpv4 = iface.family === 'IPv4' || iface.family === 4;
      if (isIpv4 && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return [...new Set(addresses)];
}

server.listen(port, '0.0.0.0', () => {
  const lanAddresses = getLanAddresses();
  console.log('\n  Xmas Rensbo dev server running at:');
  console.log(`  > Local:   http://localhost:${port}/`);
  if (lanAddresses.length > 0) {
    for (const addr of lanAddresses) {
      console.log(`  > Network: http://${addr}:${port}/`);
    }
  } else {
    console.log('  > Network: No external IPv4 LAN address detected');
  }
  console.log();
});
