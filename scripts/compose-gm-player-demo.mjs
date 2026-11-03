/* global document, console, MediaRecorder, setInterval, clearInterval, Blob, btoa, Buffer */
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Compose actual browser recordings; all content inside the two frames is untouched footage. */
export async function composeDemo(browser, out, chapters) {
  const videos = await Promise.all(['gm.webm', 'player.webm'].map(name => readFile(path.join(out, name))));
  const server = createServer((req, res) => {
    const index = req.url === '/gm.webm' ? 0 : req.url === '/player.webm' ? 1 : -1;
    if (index < 0) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'video/webm', 'Access-Control-Allow-Origin': '*', 'Content-Length': videos[index].length }); res.end(videos[index]);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const context = await browser.newContext({ viewport: { width: 1920, height: 760 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    const port = server.address().port;
    await page.setContent(`<video id="gm" crossorigin="anonymous" src="http://127.0.0.1:${port}/gm.webm" muted playsinline></video><video id="player" crossorigin="anonymous" src="http://127.0.0.1:${port}/player.webm" muted playsinline></video><canvas width="1920" height="760"></canvas>`);
    await page.waitForFunction(() => [...document.querySelectorAll('video')].every(v => v.readyState >= 3));
    console.log('Composing synchronized side-by-side gameplay video…');
    const encoded = await page.evaluate(async chapters => {
      const [gm, player] = document.querySelectorAll('video');
      const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d');
      const stream = canvas.captureStream(24);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 7000000 });
      const chunks = [];
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      const finished = new Promise(resolve => { recorder.onstop = resolve; });
      const render = () => {
        ctx.fillStyle = '#111a1c'; ctx.fillRect(0, 0, 1920, 760);
        ctx.fillStyle = '#d4b777'; ctx.font = '18px Arial'; ctx.fillText('VTT  /  THE SUNKEN CRYPT', 30, 35);
        ctx.fillStyle = '#edf1eb'; ctx.font = '30px Arial';
        const chapter = [...chapters].reverse().find(c => c.seconds <= gm.currentTime) ?? chapters[0];
        ctx.fillText(chapter.title, 30, 78);
        ctx.fillStyle = '#9fb1ad'; ctx.font = '17px Arial';
        ctx.fillText('ROWAN  ·  GAME MASTER', 30, 118); ctx.fillText('MARA  ·  PLAYER', 980, 118);
        ctx.drawImage(gm, 30, 140, 910, 568.75); ctx.drawImage(player, 980, 140, 910, 568.75);
        ctx.fillStyle = '#9fb1ad'; ctx.font = '16px Arial';
        ctx.fillText('Two independent browsers · actual UI actions · shared Socket.IO room', 30, 741);
        ctx.fillText('LOCAL DEMO  /  LIVE CAPTURE', 1595, 741);
      };
      render(); recorder.start(1000);
      await Promise.all([gm.play(), player.play()]);
      const timer = setInterval(render, 1000 / 24);
      await new Promise((resolve, reject) => { gm.onended = resolve; gm.onerror = () => reject(new Error('GM recording could not be decoded')); });
      clearInterval(timer); render(); recorder.stop(); await finished;
      stream.getTracks().forEach(track => track.stop());
      const bytes = new Uint8Array(await new Blob(chunks, { type: 'video/webm' }).arrayBuffer());
      let binary = ''; for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
      return btoa(binary);
    }, chapters);
    await writeFile(path.join(out, 'sunken-crypt-demo.webm'), Buffer.from(encoded, 'base64'));
  } finally { await context.close(); await new Promise(resolve => server.close(resolve)); }
}

