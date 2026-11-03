/* global window, localStorage, location */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium, expect } = require(process.env.DEMO_PLAYWRIGHT ?? '@playwright/test');

// Two deterministic browser actors, with UI actions gated by real socket acknowledgements.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'output/gm-player-demo');

const apiPort = 3142, webPort = 5242;
const origin = `http://127.0.0.1:${webPort}`;
const children = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser;
const chapters = [];
async function chapter(title) { chapters.push({ title, seconds: (Date.now() - started) / 1000 }); console.log(title); await pause(1800); }
let started;
function launch(args, env) {
  const child = spawn(process.execPath, args, { cwd: root, windowsHide: true, env: { ...process.env, DATABASE_URL: '', REDIS_URL: '', S3_BUCKET: '', S3_AUTODETECT: '0', DEV_ACCOUNT_EMAIL: '', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  child.stdout.on('data', text => process.stdout.write(text));
  child.stderr.on('data', text => process.stderr.write(text));
  return child;
}
async function ready(url) {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).ok) return; } catch { /* waiting for local server */ } await pause(300); }
  throw new Error(`Local server did not start: ${url}`);
}
async function state(page) { return page.evaluate(() => window.demoObserver.snapshot.state); }
async function watch(page) {
  await page.getByRole('button', { name: 'Measure', exact: true }).waitFor();
  await page.evaluate(async () => {
    const roomId = location.pathname.split('/').pop();
    const credentials = JSON.parse(localStorage.getItem('vtt.credentials.' + roomId));
    const { RoomConnection } = await import('/src/net/roomConnection.ts');
    window.demoObserver = new RoomConnection(roomId, credentials.guestToken);
    window.demoObserver.start();
  });
  await page.waitForFunction(() => window.demoObserver?.snapshot.status === 'open');
}
async function synced(gm, player, label) {
  await expect.poll(async () => {
    const [a, b] = await Promise.all([state(gm), state(player)]);
    return JSON.stringify({ tokens: a.tokens, chat: a.chat, rolls: a.rolls, initiative: a.initiative }) === JSON.stringify({ tokens: b.tokens, chat: b.chat, rolls: b.rolls, initiative: b.initiative });
  }, { message: label, timeout: 15000 }).toBe(true);
}
async function chat(page, text) {
  if (!await page.getByLabel('Message', { exact: true }).isVisible()) await page.getByRole('button', { name: /^Chat/ }).click();
  await page.getByLabel('Message', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByText(text, { exact: true })).toBeVisible();
}
async function addToken(gm, name, owner, hp, arrows) {
  await gm.getByRole('button', { name: 'New Token', exact: true }).click();
  const modal = gm.getByRole('dialog', { name: 'New Token', exact: true });
  await modal.getByRole('textbox').first().fill(name);
  await modal.getByLabel('HP', { exact: true }).fill(String(hp));
  await modal.getByLabel('Max HP', { exact: true }).fill(String(hp));
  if (owner) { await modal.getByText('Control & visibility', { exact: true }).click(); await modal.getByRole('combobox').first().selectOption({ label: owner }); }
  await modal.getByRole('button', { name: 'Choose a square', exact: true }).click();
  const board = gm.locator('.board-canvas');
  await expect(board).toHaveAttribute('aria-label', /Placing/);
  await board.focus();
  for (const arrow of arrows) await gm.keyboard.press(arrow);
  await gm.keyboard.press('Enter');
  await expect.poll(async () => Object.values((await state(gm)).tokens).some(t => t.name === name)).toBe(true);
  await gm.keyboard.press('Escape');
}
try {
  await mkdir(out, { recursive: true });
  // Refuse to attach to another person's server; this command owns both local ports.
  for (const port of [apiPort, webPort]) {
    try { await fetch(`http://127.0.0.1:${port}`); throw new Error(`Port ${port} already in use`); } catch (error) { if (error.message.includes('already in use')) throw error; }
  }
  await writeFile(path.join(out, 'tsconfig.json'), JSON.stringify({ extends: '../../tsconfig.base.json', compilerOptions: { baseUrl: root, paths: { '@vtt/shared': ['packages/shared/src/index.ts'] } } }));
  await writeFile(path.join(out, 'vite.config.mjs'), `import react from '@vitejs/plugin-react'; export default { root: ${JSON.stringify(path.join(root, 'apps/web'))}, plugins: [react()], optimizeDeps: { include: ['socket.io-client', 'pixi.js', 'zustand', 'zod', 'framer-motion'] }, resolve: { alias: { '@vtt/shared': ${JSON.stringify(path.join(root, 'packages/shared/src/index.ts'))} } }, server: { host: '127.0.0.1', port: ${webPort}, strictPort: true, fs: { allow: [${JSON.stringify(root)}, ${JSON.stringify(realpathSync(path.join(root, 'node_modules')))}] }, proxy: { '/api': 'http://127.0.0.1:${apiPort}', '/uploads': 'http://127.0.0.1:${apiPort}', '/socket.io': { target: 'http://127.0.0.1:${apiPort}', ws: true } } } };`);
  launch(['--import', 'tsx', 'apps/server/src/index.ts'], { TSX_TSCONFIG_PATH: path.join(out, 'tsconfig.json'), PORT: String(apiPort), CLIENT_ORIGIN: origin, UPLOAD_DIR: path.join(out, 'uploads') });
  await ready(`http://127.0.0.1:${apiPort}/health`);
  launch(['node_modules/vite/bin/vite.js', '--config', path.join(out, 'vite.config.mjs')], {});
  await ready(origin);
  browser = await chromium.launch({ headless: true, ...(process.env.DEMO_CHROME ? { executablePath: process.env.DEMO_CHROME } : {}), args: ['--remote-debugging-port=9242'] });
  const options = { viewport: { width: 1440, height: 900 }, recordVideo: { dir: path.join(out, 'raw'), size: { width: 1440, height: 900 } } };
  const gmContext = await browser.newContext(options);
  const playerContext = await browser.newContext(options);
  const gm = await gmContext.newPage();
  const player = await playerContext.newPage();
  gm.setDefaultTimeout(20000); player.setDefaultTimeout(20000);
  started = Date.now();
  await chapter('01 / A GM opens the Sunken Crypt');
  await gm.goto(origin + '/signup', { waitUntil: 'domcontentloaded' });
  await gm.getByLabel('Display name', { exact: true }).fill('Rowan · Game Master');
  await gm.getByLabel('Email', { exact: true }).fill(`demo-gm-${Date.now()}@example.com`);
  await gm.getByLabel('Password').fill('local-demo-correct-horse-battery');
  await gm.getByRole('button', { name: 'Create account', exact: true }).click();
  await gm.waitForURL('**/gm-dashboard');
  await gm.getByLabel('Room name', { exact: true }).fill('The Sunken Crypt');
  await gm.getByRole('button', { name: 'Create room', exact: true }).click();
  await gm.waitForURL('**/r/**');
  await watch(gm);
  const credentials = await gm.evaluate(() => JSON.parse(localStorage.getItem('vtt.credentials.' + location.pathname.split('/').pop())));
  await player.goto(origin + '/join/' + credentials.inviteCode);
  await player.getByLabel('Your name', { exact: true }).fill('Mara');
  await player.getByRole('button', { name: 'Join', exact: true }).click();
  await player.waitForURL('**/r/**');
  await watch(player);
  await chapter('02 / Two independent seats at one table');
  await gm.getByRole('tab', { name: 'Manage', exact: true }).click();
  await gm.getByRole('button', { name: 'From library', exact: true }).click();
  await gm.getByRole('button', { name: /Sunken Crypt/ }).click();
  await expect.poll(async () => (await state(player)).scene.map?.url).toBeTruthy();
  await gm.getByRole('tab', { name: 'Tokens', exact: true }).click();
  await addToken(gm, 'Mara', 'Mara', 24, ['ArrowLeft', 'ArrowLeft']);
  await addToken(gm, 'Crypt Guardian', null, 18, ['ArrowRight', 'ArrowRight']);
  await Promise.all([gm, player].map(p => p.getByRole('button', { name: 'Fit', exact: true }).click()));
  await synced(gm, player, 'Both seats received the encounter');
  await chat(gm, 'Water stirs around the ancient guardian. Mara, the passage is yours.');
  await chapter('03 / The player takes control of her own token');
  await player.getByRole('tab', { name: 'Tokens', exact: true }).click();
  const before = Object.values((await state(player)).tokens).find(t => t.name === 'Mara');
  await player.getByRole('button', { name: 'Edit Mara', exact: true }).click();
  await player.getByRole('button', { name: /Move Mara right/ }).click();
  await expect.poll(async () => Object.values((await state(gm)).tokens).find(t => t.name === 'Mara').position.x).toBeGreaterThan(before.position.x);
  await player.getByRole('dialog').getByRole('button', { name: /Close/ }).click();
  await chat(player, 'I advance toward the guardian and strike!');
  await synced(gm, player, 'Player movement and chat converged');
  await chapter('04 / A public roll, seen by both players');
  await player.getByRole('tab', { name: 'Dice', exact: true }).click();
  await player.getByPlaceholder('1d20+5', { exact: true }).fill('1d20+5');
  await player.getByRole('button', { name: 'Roll', exact: true }).click();
  await expect.poll(async () => (await state(gm)).rolls.length).toBeGreaterThan(0);
  await chapter('05 / The GM resolves the guardian’s wound');
  await gm.getByRole('button', { name: 'Edit Crypt Guardian', exact: true }).click();
  const editor = gm.getByRole('dialog');
  await editor.getByLabel('HP', { exact: true }).fill('11');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await editor.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect.poll(async () => Object.values((await state(player)).tokens).find(t => t.name === 'Crypt Guardian').stats.hp).toBe(11);
  await chat(gm, 'Your blow lands. The guardian reels — 11 HP remain.');
  await player.getByRole('tab', { name: 'Tokens', exact: true }).click();
  await synced(gm, player, 'Final token HP, positions, public rolls and chat match');
  const final = await state(gm);
  assert.equal(Object.keys(final.participants).length, 2);
  assert.equal(Object.keys(final.tokens).length, 2);
  assert.equal(final.chat.length, 3);
  await writeFile(path.join(out, 'verification.json'), JSON.stringify({ roomId: final.roomId, actors: ['GM account', 'Guest player'], checks: ['2 independent browser contexts', 'UI signup / create / invite join', 'owned token movement reached GM', 'public dice reached GM', 'guardian HP reached player', 'tokens, chat, rolls and initiative converge'], tokens: Object.values(final.tokens).map(({ name, position, stats }) => ({ name, position, stats })), chapters }, null, 2));
  // Optional actual Playwright MCP visual QA against the running recording browser.
  if (process.env.DEMO_MCP_CLI) {
    const { captureMcp } = await import('./gm-player-mcp.mjs');
    await captureMcp(process.env.DEMO_MCP_CLI, out);
  }
  await chapter('06 / One shared encounter. Two live perspectives.');
  await pause(5000);
  await gmContext.close(); await playerContext.close();
  await rename(await gm.video().path(), path.join(out, 'gm.webm'));
  await rename(await player.video().path(), path.join(out, 'player.webm'));
  const { composeDemo } = await import('./compose-gm-player-demo.mjs');
  await composeDemo(browser, out, chapters);
  console.log(`Recorded actual gameplay: ${out}`);
} finally {
  await browser?.close();
  for (const child of children.reverse()) child.kill();
}
