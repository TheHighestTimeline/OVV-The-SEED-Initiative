import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.json': 'application/json' };
http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/shot/')) {
    const name = path.basename(req.url).replace(/[^a-z0-9_.-]/gi, '');
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const b64 = body.replace(/^data:image\/png;base64,/, '');
      fs.mkdirSync(path.join(root, 'shots'), { recursive: true });
      fs.writeFileSync(path.join(root, 'shots', name + '.png'), Buffer.from(b64, 'base64'));
      res.writeHead(200, { 'access-control-allow-origin': '*' }); res.end('ok');
    });
    return;
  }
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/dist/OVMG_SEED_3DCampusWorld_20260809_v4.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(8811, () => console.log('serving on http://localhost:8811/'));
