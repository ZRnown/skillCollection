import { afterEach, expect, test } from 'bun:test';
import { evaluate, fetchJsonDirect, getChromeSpawnOptions } from './cdp.ts';

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
