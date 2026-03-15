import { expect, test } from 'bun:test';
import path from 'node:path';

test('supports close-on-failure flag in help output', () => {
  const scriptPath = path.join(import.meta.dir, 'baijiahao-article.ts');
  const result = Bun.spawnSync([
    'bun',
    scriptPath,
    '--close-on-failure',
    '--help',
  ], {
    stdout: 'pipe',
    stderr: 'pipe',
  });

  expect(result.exitCode).toBe(0);
  const output = `${Buffer.from(result.stdout).toString()}${Buffer.from(result.stderr).toString()}`;
  expect(output).toContain('--close-on-failure');
});
