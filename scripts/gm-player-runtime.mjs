import { once } from 'node:events';

export function demoEnvironment(env) {
  return { ...env, NODE_ENV: 'development', DATABASE_URL: '', REDIS_URL: '', S3_ENDPOINT: '', S3_BUCKET: '', S3_ACCESS_KEY: '', S3_SECRET_KEY: '', S3_AUTODETECT: '0', DEV_ACCOUNT_EMAIL: '' };
}

export function createDemoCleanup(getBrowser, children) {
  let pending;
  return () => pending ??= (async () => {
    try {
      await getBrowser()?.close();
    } finally {
      await Promise.all(children.map(async child => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        const exited = once(child, 'exit');
        child.kill();
        await exited;
      }));
    }
  })();
}

export function installDemoSignals(cleanup) {
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
    process.on(signal, () => {
      void cleanup().then(() => process.exit(code), error => {
        console.error(error);
        process.exit(1);
      });
    });
  }
}
