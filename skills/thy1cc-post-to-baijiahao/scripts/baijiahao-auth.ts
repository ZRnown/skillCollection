import type { ChromeSession } from './cdp.ts';
import { evaluate } from './cdp.ts';

export interface BaijiahaoPageState {
  url: string;
  bodyText: string;
  currentUser: any | null;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function hasLoggedOutText(bodyText: string): boolean {
  const text = normalize(bodyText);
  if (!text) return false;

  const markers = [
    '账号已退出',
    '请重新登录',
    '扫码登录',
    '注册百家号',
    '请登录百家号',
    '安全验证',
    '验证码',
    '影响世界',
  ];

  return markers.some((marker) => text.includes(marker.toLowerCase()));
}

function hasLoggedInDashboardText(bodyText: string): boolean {
  const text = normalize(bodyText);
  if (!text) return false;

  const markers = [
    '发布作品',
    '内容管理',
    '数据中心',
    '个人中心',
    '粉丝管理',
    '收入中心',
  ];

  const matches = markers.filter((marker) => text.includes(marker.toLowerCase()));
  return matches.length >= 2;
}

export function isCurrentUserPayloadLoggedIn(payload: any): boolean {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.errno === 10001401) return false;
  if (payload.errno === 0) return true;

  const data = payload.data;
  if (data && typeof data === 'object') {
    if (data.uid || data.id || data.author_id || data.authorId || data.name || data.nickname) return true;
  }

  return false;
}

export async function getBaijiahaoPageState(session: ChromeSession): Promise<BaijiahaoPageState> {
  return await evaluate<BaijiahaoPageState>(session, `
    (async function() {
      let currentUser = null;
      try {
        const resp = await fetch('/builder/author/app/currentuser', {
          credentials: 'include',
          headers: { Accept: 'application/json, text/plain, */*' }
        });
        currentUser = await resp.json();
      } catch (error) {
        currentUser = { error: String(error) };
      }
      return {
        url: window.location.href,
        bodyText: document.body?.innerText || '',
        currentUser
      };
    })()
  `);
}

export function isBaijiahaoSessionLoggedIn(state: BaijiahaoPageState): boolean {
  if (isCurrentUserPayloadLoggedIn(state.currentUser)) return true;
  if (hasLoggedInDashboardText(state.bodyText || '')) return true;
  if (hasLoggedOutText(state.bodyText || '')) return false;

  const url = state.url || '';
  if (url.includes('/builder/') && !url.includes('/login')) return true;
  return false;
}
