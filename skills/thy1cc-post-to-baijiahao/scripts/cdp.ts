import { spawn, type SpawnOptions } from 'node:child_process';
import fs from 'node:fs';
import { mkdir } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Unable to allocate a free TCP port.')));
        return;
      }
      const port = address.port;
      server.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
  });
}

export function findChromeExecutable(): string | undefined {
  const override = process.env.BAIJIAHAO_BROWSER_CHROME_PATH?.trim();
  if (override && fs.existsSync(override)) return override;

  const candidates: string[] = [];
  switch (process.platform) {
    case 'darwin':
      candidates.push(
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
      );
      break;
    case 'win32':
      candidates.push(
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      );
      break;
    default:
      candidates.push('/usr/bin/google-chrome', '/usr/bin/chromium');
      break;
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

export function getDefaultProfileDir(): string {
  const base = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(base, 'baijiahao-browser-profile');
}

export async function fetchJsonDirect<T = unknown>(url: string): Promise<T> {
  const target = new URL(url);
  const transport = target.protocol === 'https:' ? https : http;

  return await new Promise<T>((resolve, reject) => {
    const req = transport.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port ? parseInt(target.port, 10) : undefined,
      path: `${target.pathname}${target.search}`,
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    }, (res) => {
      const statusCode = res.statusCode ?? 0;
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        if (statusCode < 200 || statusCode >= 300) {
          reject(new Error(`Request failed: ${statusCode} ${res.statusMessage || ''}`.trim()));
          return;
        }

        try {
          resolve(JSON.parse(body) as T);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

export function getChromeSpawnOptions(): SpawnOptions {
  return {
    stdio: 'ignore',
    detached: true,
  };
}

export function getChromeLaunchArgs(url: string, port: number, profileDir: string): string[] {
  return [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    '--start-maximized',
    url,
  ];
}

async function waitForChromeDebugPort(port: number, timeoutMs: number): Promise<string> {
  const start = Date.now();
  let lastError: unknown = null;

  while (Date.now() - start < timeoutMs) {
    try {
      const version = await fetchJsonDirect<{ webSocketDebuggerUrl?: string }>(`http://127.0.0.1:${port}/json/version`);
      if (version.webSocketDebuggerUrl) return version.webSocketDebuggerUrl;
      lastError = new Error('Missing webSocketDebuggerUrl');
    } catch (error) {
      lastError = error;
    }
    await sleep(200);
  }

  throw new Error(`Chrome debug port not ready: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

export class CdpConnection {
  private ws: WebSocket;
  private nextId = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> | null }>();
  private eventHandlers = new Map<string, Set<(params: unknown) => void>>();

  private constructor(ws: WebSocket) {
    this.ws = ws;
    this.ws.addEventListener('message', (event) => {
      try {
        const data = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data as ArrayBuffer);
        const msg = JSON.parse(data) as { id?: number; method?: string; params?: unknown; result?: unknown; error?: { message?: string } };

        if (msg.method) {
          const handlers = this.eventHandlers.get(msg.method);
          if (handlers) handlers.forEach((handler) => handler(msg.params));
        }

        if (msg.id) {
          const pending = this.pending.get(msg.id);
          if (pending) {
            this.pending.delete(msg.id);
            if (pending.timer) clearTimeout(pending.timer);
            if (msg.error?.message) pending.reject(new Error(msg.error.message));
            else pending.resolve(msg.result);
          }
        }
      } catch {}
    });

    this.ws.addEventListener('close', () => {
      for (const [id, pending] of this.pending.entries()) {
        this.pending.delete(id);
        if (pending.timer) clearTimeout(pending.timer);
        pending.reject(new Error('CDP connection closed.'));
      }
    });
  }

  static async connect(url: string, timeoutMs: number): Promise<CdpConnection> {
    const ws = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP connection timeout.')), timeoutMs);
      ws.addEventListener('open', () => { clearTimeout(timer); resolve(); });
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP connection failed.')); });
    });
    return new CdpConnection(ws);
  }

  on(method: string, handler: (params: unknown) => void): void {
    if (!this.eventHandlers.has(method)) this.eventHandlers.set(method, new Set());
    this.eventHandlers.get(method)!.add(handler);
  }

  async send<T = unknown>(method: string, params?: Record<string, unknown>, options?: { sessionId?: string; timeoutMs?: number }): Promise<T> {
    const id = ++this.nextId;
    const message: Record<string, unknown> = { id, method };
    if (params) message.params = params;
    if (options?.sessionId) message.sessionId = options.sessionId;

    const timeoutMs = options?.timeoutMs ?? 15_000;
    const result = await new Promise<unknown>((resolve, reject) => {
      const timer = timeoutMs > 0 ? setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, timeoutMs) : null;
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify(message));
    });
    return result as T;
  }

  close(): void {
    try {
      this.ws.close();
    } catch {}
  }
}

export interface ChromeSession {
  cdp: CdpConnection;
  sessionId: string;
  targetId: string;
}

export async function tryConnectExisting(port: number): Promise<CdpConnection | null> {
  try {
    const version = await fetchJsonDirect<{ webSocketDebuggerUrl?: string }>(`http://127.0.0.1:${port}/json/version`);
    if (version.webSocketDebuggerUrl) {
      return await CdpConnection.connect(version.webSocketDebuggerUrl, 5_000);
    }
  } catch {}
  return null;
}

interface ChromeDebugTargetInfo {
  type?: string;
  title?: string;
  url?: string;
}

interface ChromeDebugVersionInfo {
  webSocketDebuggerUrl?: string;
  'User-Agent'?: string;
  userAgent?: string;
}

export interface ChromeDebugPortCandidate {
  port: number;
  version: ChromeDebugVersionInfo;
  targets: ChromeDebugTargetInfo[];
}

function matchesAnyHint(value: string, hints: string[]): boolean {
  const text = value.toLowerCase();
  return hints.some((hint) => text.includes(hint.toLowerCase()));
}

export function pickExistingChromeDebugPort(
  candidates: ChromeDebugPortCandidate[],
  options: { urlHints?: string[] } = {},
): number | null {
  const hints = (options.urlHints || []).map((value) => value.trim()).filter(Boolean);

  for (const candidate of candidates) {
    const version = candidate.version || {};
    const websocket = version.webSocketDebuggerUrl;
    const userAgent = String(version['User-Agent'] || version.userAgent || '');
    if (!websocket) continue;
    if (/headlesschrome/i.test(userAgent)) continue;

    const pageTargets = (candidate.targets || []).filter((target) => target.type === 'page');
    if (pageTargets.length === 0) continue;

    if (hints.length > 0) {
      const matched = pageTargets.some((target) =>
        matchesAnyHint(String(target.url || ''), hints) || matchesAnyHint(String(target.title || ''), hints)
      );
      if (!matched) continue;
    }

    return candidate.port;
  }

  return null;
}

export async function findExistingChromeDebugPort(options: { urlHints?: string[] } = {}): Promise<number | null> {
  if (process.platform !== 'darwin' && process.platform !== 'linux') return null;
  try {
    const { execSync } = await import('node:child_process');
    const cmd = process.platform === 'darwin'
      ? `lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | grep -i 'google\|chrome' | awk '{print $9}' | sed 's/.*://'`
      : `ss -tlnp 2>/dev/null | grep -i chrome | awk '{print $4}' | sed 's/.*://'`;
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 5_000 }).trim();
    if (!output) return null;
    const ports = output.split('\n').map((value) => parseInt(value, 10)).filter((value) => !isNaN(value) && value > 0);
    const candidates: ChromeDebugPortCandidate[] = [];
    for (const port of ports) {
      try {
        const version = await fetchJsonDirect<ChromeDebugVersionInfo>(`http://127.0.0.1:${port}/json/version`);
        if (!version.webSocketDebuggerUrl) continue;
        const targets = await fetchJsonDirect<ChromeDebugTargetInfo[]>(`http://127.0.0.1:${port}/json/list`).catch(() => []);
        candidates.push({
          port,
          version,
          targets: Array.isArray(targets) ? targets : [],
        });
      } catch {}
    }
    return pickExistingChromeDebugPort(candidates, options);
  } catch {}
  return null;
}

export async function launchChrome(url: string, profileDir?: string): Promise<{ cdp: CdpConnection; chrome: ReturnType<typeof spawn> }> {
  const chromePath = findChromeExecutable();
  if (!chromePath) throw new Error('Chrome not found. Set BAIJIAHAO_BROWSER_CHROME_PATH if needed.');

  const profile = profileDir ?? getDefaultProfileDir();
  await mkdir(profile, { recursive: true });

  const port = await getFreePort();
  console.log(`[cdp] Launching Chrome (profile: ${profile})`);
  const chrome = spawn(chromePath, getChromeLaunchArgs(url, port, profile), getChromeSpawnOptions());
  chrome.unref();

  const wsUrl = await waitForChromeDebugPort(port, 30_000);
  const cdp = await CdpConnection.connect(wsUrl, 30_000);
  return { cdp, chrome };
}

export async function getPageSession(cdp: CdpConnection, urlPattern: string): Promise<ChromeSession> {
  const targets = await cdp.send<{ targetInfos: Array<{ targetId: string; url: string; type: string }> }>('Target.getTargets');
  const pageTarget = targets.targetInfos.find((target) => target.type === 'page' && target.url.includes(urlPattern));
  if (!pageTarget) throw new Error(`Page not found: ${urlPattern}`);

  const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId: pageTarget.targetId, flatten: true });
  await cdp.send('Page.enable', {}, { sessionId });
  await cdp.send('Runtime.enable', {}, { sessionId });
  await cdp.send('DOM.enable', {}, { sessionId });

  return { cdp, sessionId, targetId: pageTarget.targetId };
}

export async function waitForNewTab(cdp: CdpConnection, initialIds: Set<string>, urlPattern: string, timeoutMs = 30_000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const targets = await cdp.send<{ targetInfos: Array<{ targetId: string; url: string; type: string }> }>('Target.getTargets');
    const newTab = targets.targetInfos.find((target) => target.type === 'page' && !initialIds.has(target.targetId) && target.url.includes(urlPattern));
    if (newTab) return newTab.targetId;
    await sleep(500);
  }
  throw new Error(`New tab not found: ${urlPattern}`);
}

export async function clickElement(session: ChromeSession, selector: string): Promise<void> {
  const posResult = await session.cdp.send<{ result: { value: string } }>('Runtime.evaluate', {
    expression: `
      (function() {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return 'null';
        el.scrollIntoView({ block: 'center' });
        const rect = el.getBoundingClientRect();
        return JSON.stringify({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
      })()
    `,
    returnByValue: true,
  }, { sessionId: session.sessionId });

  if (posResult.result.value === 'null') throw new Error(`Element not found: ${selector}`);
  const pos = JSON.parse(posResult.result.value);
  await session.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1 }, { sessionId: session.sessionId });
  await sleep(50);
  await session.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1 }, { sessionId: session.sessionId });
}

export async function typeText(session: ChromeSession, text: string): Promise<void> {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length > 0) {
      await session.cdp.send('Input.insertText', { text: lines[i] }, { sessionId: session.sessionId });
    }
    if (i < lines.length - 1) {
      await session.cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, { sessionId: session.sessionId });
      await session.cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, { sessionId: session.sessionId });
    }
    await sleep(30);
  }
}

export async function evaluate<T = unknown>(session: ChromeSession, expression: string): Promise<T> {
  const result = await session.cdp.send<{ result: { value: T } }>('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  }, { sessionId: session.sessionId });
  return result.result.value;
}
