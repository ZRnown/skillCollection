import { afterEach, expect, test } from 'bun:test';
import {
  evaluate,
  fetchJsonDirect,
  getChromeSpawnOptions,
  pickExistingChromeDebugPort,
} from './cdp.ts';

const savedProxyEnv = {
  all_proxy: process.env.all_proxy,
  ALL_PROXY: process.env.ALL_PROXY,
  http_proxy: process.env.http_proxy,
  HTTP_PROXY: process.env.HTTP_PROXY,
  https_proxy: process.env.https_proxy,
  HTTPS_PROXY: process.env.HTTPS_PROXY,
};

afterEach(() => {
  for (const [key, value] of Object.entries(savedProxyEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('Chrome launch spawn options detach the browser process for reuse', () => {
  const options = getChromeSpawnOptions();

  expect(options.stdio).toBe('ignore');
  expect(options.detached).toBe(true);
});

test('fetchJsonDirect bypasses proxy environment variables for localhost targets', async () => {
  const proxyHits: string[] = [];

  const proxyServer = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      proxyHits.push(request.url);
      return Response.json({ via: 'proxy' }, { status: 502 });
    },
  });

  const targetServer = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      return Response.json({ via: 'target', ok: true });
    },
  });

  process.env.all_proxy = `http://127.0.0.1:${proxyServer.port}`;
  process.env.http_proxy = `http://127.0.0.1:${proxyServer.port}`;
  process.env.https_proxy = `http://127.0.0.1:${proxyServer.port}`;

  try {
    const result = await fetchJsonDirect<{ via: string; ok: boolean }>(`http://127.0.0.1:${targetServer.port}/json/version`);
    expect(result).toEqual({ via: 'target', ok: true });
    expect(proxyHits).toHaveLength(0);
  } finally {
    await proxyServer.stop(true);
    await targetServer.stop(true);
  }
});

test('evaluate awaits async page expressions before reading returnByValue results', async () => {
  const calls: Array<{ method: string; params: Record<string, unknown>; options?: Record<string, unknown> }> = [];
  const session = {
    cdp: {
      async send(method: string, params?: Record<string, unknown>, options?: Record<string, unknown>) {
        calls.push({ method, params: params || {}, options });
        return { result: { value: { ok: true } } };
      },
    },
    sessionId: 'session-1',
    targetId: 'target-1',
  } as any;

  const result = await evaluate<{ ok: boolean }>(session, '(async function(){ return { ok: true }; })()');

  expect(result).toEqual({ ok: true });
  expect(calls[0]?.method).toBe('Runtime.evaluate');
  expect(calls[0]?.params).toMatchObject({
    returnByValue: true,
    awaitPromise: true,
  });
});

test('pickExistingChromeDebugPort ignores headless and empty automation sessions for Baijiahao reuse', () => {
  const port = pickExistingChromeDebugPort([
    {
      port: 56944,
      version: {
        webSocketDebuggerUrl: 'ws://127.0.0.1:56944/devtools/browser/headless',
        userAgent: 'Mozilla/5.0 HeadlessChrome/146.0.0.0 Safari/537.36',
      },
      targets: [
        { type: 'page', title: '百家号', url: 'https://baijiahao.baidu.com/builder/theme/bjh/login' },
      ],
    },
    {
      port: 54983,
      version: {
        webSocketDebuggerUrl: 'ws://127.0.0.1:54983/devtools/browser/playwright',
        userAgent: 'Mozilla/5.0 Chrome/146.0.0.0 Safari/537.36',
      },
      targets: [],
    },
  ], { urlHints: ['baijiahao.baidu.com'] });

  expect(port).toBeNull();
});

test('pickExistingChromeDebugPort prefers a non-headless Baijiahao page target', () => {
  const port = pickExistingChromeDebugPort([
    {
      port: 60001,
      version: {
        webSocketDebuggerUrl: 'ws://127.0.0.1:60001/devtools/browser/other',
        userAgent: 'Mozilla/5.0 Chrome/146.0.0.0 Safari/537.36',
      },
      targets: [
        { type: 'page', title: 'GitHub', url: 'https://github.com/' },
      ],
    },
    {
      port: 60002,
      version: {
        webSocketDebuggerUrl: 'ws://127.0.0.1:60002/devtools/browser/bjh',
        userAgent: 'Mozilla/5.0 Chrome/146.0.0.0 Safari/537.36',
      },
      targets: [
        { type: 'page', title: '百家号', url: 'https://baijiahao.baidu.com/builder/rc/content?type=all' },
      ],
    },
  ], { urlHints: ['baijiahao.baidu.com'] });

  expect(port).toBe(60002);
});
