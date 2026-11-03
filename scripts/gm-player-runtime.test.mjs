import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import test from 'node:test';
import { demoEnvironment, createDemoCleanup } from './gm-player-runtime.mjs';

const runtime = new URL('./gm-player-runtime.mjs', import.meta.url).href;

test('demo environment forces local assets even with production configuration', async () => {
  const env = demoEnvironment({ ...process.env, NODE_ENV: 'production', DATABASE_URL: 'postgres://production', REDIS_URL: 'redis://production', S3_ENDPOINT: 'https://production.invalid', S3_BUCKET: 'production', S3_ACCESS_KEY: 'secret', S3_SECRET_KEY: 'secret', S3_AUTODETECT: '1' });
  for (const key of ['DATABASE_URL', 'REDIS_URL', 'S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY']) assert.equal(env[key], '', key);
  assert.equal(env.NODE_ENV, 'development');
  assert.equal(env.S3_AUTODETECT, '0');
  const code = `import { createAssetStore, LocalDiskAssetStore } from './apps/server/src/store/assetStore.ts'; const store = await createAssetStore('unused', process.env, () => { throw new Error('Remote storage must never be contacted'); }); if (!(store instanceof LocalDiskAssetStore)) throw new Error('Expected local disk');`;
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { env, windowsHide: true, stdio: 'inherit' });
  assert.deepEqual(await once(child, 'exit'), [0, null]);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  test(`${signal} closes browser before stopping and awaiting owned children`, { timeout: 15000 }, async () => {
    const code = `
      import assert from 'node:assert/strict';
      import { spawn } from 'node:child_process';
      import { once } from 'node:events';
      import { createDemoCleanup, installDemoSignals } from ${JSON.stringify(runtime)};
      const children = [0, 1].map(() => spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { windowsHide: true, stdio: 'ignore' }));
      await Promise.all(children.map(child => once(child, 'spawn')));
      let calls = 0;
      const cleanup = createDemoCleanup(() => ({ close: async () => {
        calls++;
        assert.equal(calls, 1);
        await new Promise(resolve => setTimeout(resolve, 25));
        assert.ok(children.every(child => child.exitCode === null && child.signalCode === null));
        process.send({ phase: 'browser-closed' });
      }}), children);
      installDemoSignals(cleanup);
      process.on('message', () => {
        process.emit(${JSON.stringify(signal)});
        assert.equal(cleanup(), cleanup());
      });
      process.send({ phase: 'ready', pids: children.map(child => child.pid) });
    `;
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], { windowsHide: true, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    const messages = [];
    let pids = [];
    child.on('message', message => { messages.push(message.phase); if (message.phase === 'ready') { pids = message.pids; child.send('signal'); } });
    try {
      assert.deepEqual(await once(child, 'exit'), [signal === 'SIGINT' ? 130 : 143, null]);
      assert.deepEqual(messages, ['ready', 'browser-closed']);
      for (const pid of pids) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    } finally {
      child.kill();
      for (const pid of pids) { try { process.kill(pid); } catch { /* already stopped */ } }
    }
  });
}

test('cleanup still awaits children if closing the browser fails', async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { windowsHide: true, stdio: 'ignore' });
  await once(child, 'spawn');
  const failure = new Error('Browser disconnected');
  const cleanup = createDemoCleanup(() => ({ close: async () => { throw failure; } }), [child]);
  try {
    const first = cleanup();
    assert.equal(first, cleanup());
    await assert.rejects(first, failure);
    assert.ok(child.exitCode !== null || child.signalCode !== null);
  } finally {
    child.kill();
  }
});
