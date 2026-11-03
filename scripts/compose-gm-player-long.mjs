/* global document, MediaRecorder */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { open, stat, rename, rm } from 'node:fs/promises';
import path from 'node:path';

/** Compose untouched browser footage at normal speed, streaming encoded chunks to disk. */
export async function composeLongDemo(browser, out, chapters) {
  if (!chapters.length) throw new Error('At least one chapter is required');
  const sources = Object.fromEntries(await Promise.all(['gm', 'player'].map(async actor => {
    const file = path.join(out, `${actor}.webm`);
    return [`/${actor}.webm`, { file, size: (await stat(file)).size }];
  })));
  const server = createServer((req, res) => {
    const source = sources[req.url];
    if (!source) { res.writeHead(404); res.end(); return; }
    const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
    const start = match ? Number(match[1]) : 0;
    const end = match?.[2] ? Math.min(Number(match[2]), source.size - 1) : source.size - 1;
    if (start > end || start >= source.size) { res.writeHead(416); res.end(); return; }
    res.writeHead(match ? 206 : 200, {
      'Content-Type': 'video/webm', 'Access-Control-Allow-Origin': '*',
      'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1,
      ...(match ? { 'Content-Range': `bytes ${start}-${end}/${source.size}` } : {}),
    });
    const stream = createReadStream(source.file, { start, end });
    stream.on('error', error => res.destroy(error));
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const destination = path.join(out, 'sunken-crypt-demo.webm');
  const temporary = destination + '.partial';
  let context, file;
  try {
    file = await open(temporary, 'w');
    context = await browser.newContext({ viewport: { width: 1920, height: 760 } });
    const page = await context.newPage();
    page.setDefaultTimeout(120000);
    await page.exposeFunction('saveVideoChunk', async encoded => { await file.writeFile(Buffer.from(encoded, 'base64')); });
    await page.setContent(`<video id="gm" crossorigin="anonymous" src="http://127.0.0.1:${server.address().port}/gm.webm" muted playsinline></video><video id="player" crossorigin="anonymous" src="http://127.0.0.1:${server.address().port}/player.webm" muted playsinline></video><canvas width="1920" height="760"></canvas>`);
    await page.waitForFunction(() => [...document.querySelectorAll('video')].every(video => video.readyState >= 3));
    console.log('Composing at normal playback speed; encoded chunks stream to disk.');
    const result = await page.evaluate(async chapters => {
      const [gm, player] = document.querySelectorAll('video');
      const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d');
      const stream = canvas.captureStream(24);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 7000000 });
      let pending = Promise.resolve(), writeError;
      recorder.ondataavailable = event => {
        if (!event.data.size) return;
        pending = pending.then(async () => {
          const bytes = new Uint8Array(await event.data.arrayBuffer());
          let binary = '';
          for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
          await globalThis.saveVideoChunk(btoa(binary));
        }).catch(error => { writeError = error; });
      };
      const stopped = new Promise((resolve, reject) => { recorder.onstop = resolve; recorder.onerror = reject; });
      const render = () => {
        ctx.fillStyle = '#111a1c'; ctx.fillRect(0, 0, 1920, 760);
        ctx.fillStyle = '#d4b777'; ctx.font = '18px Arial'; ctx.fillText('VTT  /  THE SUNKEN CRYPT', 30, 35);
        ctx.fillStyle = '#edf1eb'; ctx.font = '30px Arial';
        const chapter = [...chapters].reverse().find(chapter => chapter.seconds <= gm.currentTime) ?? chapters[0];
        ctx.fillText(chapter.title, 30, 78, 1850);
        ctx.fillStyle = '#9fb1ad'; ctx.font = '17px Arial';
        ctx.fillText('ROWAN  ·  GAME MASTER', 30, 118); ctx.fillText('MARA  ·  PLAYER', 980, 118);
        ctx.drawImage(gm, 30, 140, 910, 568.75); ctx.drawImage(player, 980, 140, 910, 568.75);
        ctx.font = '16px Arial';
        ctx.fillText('Two independent browsers · actual UI actions · shared Socket.IO room', 30, 741);
        const seconds = Math.floor(gm.currentTime);
        ctx.fillText(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}  /  LIVE CAPTURE`, 1660, 741);
      };
      render();
      let timer;
      try {
        recorder.start(1000);
        const ended = new Promise((resolve, reject) => {
          gm.onended = resolve;
          for (const video of [gm, player]) video.onerror = () => reject(new Error('Source video could not be decoded'));
        });
        await Promise.all([gm.play(), player.play()]);
        timer = setInterval(render, 1000 / 24);
        await ended;
      } finally {
        clearInterval(timer);
        render();
        if (recorder.state !== 'inactive') recorder.stop();
        await stopped;
        await pending;
        stream.getTracks().forEach(track => track.stop());
      }
      if (writeError) throw writeError;
      return { gmSeconds: gm.currentTime, playerSeconds: player.currentTime, width: canvas.width, height: canvas.height };
    }, chapters);
    await file.close(); file = undefined;
    await rename(temporary, destination);
    return { ...result, destination };
  } finally {
    await context?.close();
    await file?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(temporary, { force: true });
  }
}
