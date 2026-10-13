import { spawnSync } from 'node:child_process';
for (const zone of ['Asia/Taipei','UTC','America/Los_Angeles','Pacific/Honolulu','Pacific/Kiritimati']) {
  for (const script of ['tests/dashboard-regression.cjs','tests/today-regression.cjs']) {
    const result = spawnSync(process.execPath, [script, 'index.html'], { env: { ...process.env, TZ: zone }, stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
