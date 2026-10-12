// Starts the game server plus a Cloudflare tunnel, then prints (and copies) the public link.
// Run with: start-online.bat
// The first run downloads Cloudflare's official cloudflared.exe into tools/cloudflared/.
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const CLOUDFLARED = path.join(__dirname, 'cloudflared', 'cloudflared.exe');
const DOWNLOAD_URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';
const PORT = process.env.PORT || 3000;

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'hollowhearth' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 8) {
        res.resume();
        return resolve(download(res.headers.location, dest, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      const total = +res.headers['content-length'] || 0;
      let got = 0, lastPct = -1;
      const file = fs.createWriteStream(dest + '.part');
      res.on('data', (d) => {
        got += d.length;
        const pct = total ? Math.floor(got / total * 100) : 0;
        if (pct !== lastPct && pct % 10 === 0) { lastPct = pct; process.stdout.write(`  downloading cloudflared... ${pct}%\r`); }
      });
      res.pipe(file);
      file.on('finish', () => file.close(() => { fs.renameSync(dest + '.part', dest); console.log('\n  cloudflared downloaded.'); resolve(); }));
      file.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  if (!fs.existsSync(CLOUDFLARED)) {
    console.log('  First run: getting Cloudflare\'s tunnel tool (about 55 MB, one time only)...');
    fs.mkdirSync(path.dirname(CLOUDFLARED), { recursive: true });
    try { await download(DOWNLOAD_URL, CLOUDFLARED); }
    catch (e) {
      console.log('\n  Could not download cloudflared: ' + e.message);
      console.log('  Download it yourself from ' + DOWNLOAD_URL);
      console.log('  and save it as tools\\cloudflared\\cloudflared.exe, then run start-online.bat again.');
      process.exit(1);
    }
  }

  const server = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], { cwd: ROOT, stdio: 'inherit' });
  const tunnel = spawn(CLOUDFLARED, ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:' + PORT], { cwd: ROOT });
  let shown = false;
  const watch = (buf) => {
    const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && !shown) {
      shown = true;
      try { execSync('clip', { input: m[0] }); } catch (e) { /* clipboard unavailable */ }
      console.log('\n  ==========================================================');
      console.log('   SHARE THIS LINK WITH FRIENDS (already copied):');
      console.log('   ' + m[0]);
      console.log('  ==========================================================');
      console.log('   Keep this window open while people play. Close it to stop.\n');
    }
  };
  tunnel.stdout.on('data', watch);
  tunnel.stderr.on('data', watch);
  tunnel.on('exit', (code) => { console.log(`\n  The tunnel stopped (code ${code}). Close this window and run start-online.bat again for a new link.`); });

  const stop = () => { tunnel.kill(); server.kill(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  server.on('exit', () => { tunnel.kill(); process.exit(0); });
}

main();
