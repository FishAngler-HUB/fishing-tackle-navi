/**
 * ローカル確認用の簡易静的サーバー（依存パッケージなし）。
 * file:// で開くと fetch('./rakuten_products.json') がブラウザのセキュリティ制限で
 * ブロックされるため、http://localhost 経由で確認するために使う。
 *
 * 使い方: node scripts/dev-server.js
 *   → http://localhost:8080/釣りタックルナビ.html をブラウザで開く
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.join(__dirname, '..');
const PORT = 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const filePath = path.join(ROOT_DIR, urlPath === '/' ? '/index.html' : urlPath);

  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`ローカルサーバー起動: http://localhost:${PORT}/釣りタックルナビ.html`);
});
