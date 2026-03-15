import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { findChromeExecutable, getDefaultProfileDir } from './cdp.ts';

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

const results: CheckResult[] = [];

function log(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}: ${detail}`);
}

async function checkChrome(): Promise<void> {
  const chromePath = findChromeExecutable();
  if (chromePath) log('Chrome', true, chromePath);
  else log('Chrome', false, 'Not found. Install Chrome or set BAIJIAHAO_BROWSER_CHROME_PATH.');
}

async function checkProfileDir(): Promise<void> {
  const profileDir = getDefaultProfileDir();
  try {
    fs.mkdirSync(profileDir, { recursive: true });
    log('Profile dir', true, profileDir);
  } catch (error) {
    log('Profile dir', false, `Cannot create ${profileDir}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function checkBun(): Promise<void> {
  const result = spawnSync('npx', ['-y', 'bun', '--version'], { stdio: 'pipe', timeout: 30_000 });
  if (result.status === 0) log('Bun runtime', true, `v${result.stdout.toString().trim()}`);
  else log('Bun runtime', false, 'Cannot run bun. Install from https://bun.sh/');
}

async function checkReachability(): Promise<void> {
  const result = spawnSync('curl', ['-I', '-s', 'https://baijiahao.baidu.com/'], { stdio: 'pipe', timeout: 15_000 });
  if (result.status === 0) {
    const output = result.stdout.toString();
    const ok = output.includes('200') || output.includes('302');
    log('Baijiahao reachability', ok, ok ? 'baijiahao.baidu.com responded' : 'Unexpected response');
  } else {
    log('Baijiahao reachability', false, 'curl failed to reach baijiahao.baidu.com');
  }
}

async function checkConfigHints(): Promise<void> {
  const projectPath = path.join(process.cwd(), '.thy1cc-skills', 'thy1cc-post-to-baijiahao', 'EXTEND.md');
  const userPath = path.join(process.env.HOME || '', '.thy1cc-skills', 'thy1cc-post-to-baijiahao', 'EXTEND.md');
  const found = [projectPath, userPath].find((filePath) => filePath && fs.existsSync(filePath));
  if (found) log('EXTEND.md', true, found);
  else log('EXTEND.md', true, 'Not found. Optional, but recommended for author/profile/editor defaults.');
}

async function main(): Promise<void> {
  console.log('=== thy1cc-post-to-baijiahao: Permission & Environment Check ===\n');

  await checkChrome();
  await checkProfileDir();
  await checkBun();
  await checkReachability();
  await checkConfigHints();

  console.log('\n--- Summary ---');
  const failed = results.filter((result) => !result.ok);
  if (failed.length === 0) {
    console.log('All required checks passed.');
    return;
  }

  console.log(`${failed.length} issue(s) found:`);
  for (const failedCheck of failed) {
    console.log(`  ❌ ${failedCheck.name}: ${failedCheck.detail}`);
  }
  process.exit(1);
}

await main().catch((error) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
