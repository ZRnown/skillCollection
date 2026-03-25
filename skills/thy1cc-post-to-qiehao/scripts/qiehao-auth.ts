import type { ChromeSession } from './cdp.ts';
import { evaluate } from './cdp.ts';

export interface QiehaoPageState {
  url: string;
  title: string;
  bodyText: string;
  currentUser: any | null;
  restrictionReason: string | null;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function hasLoggedOutText(bodyText: string): boolean {
  const text = normalize(bodyText);
  if (!text) return false;

  const markers = [
    '扫码登录',
    '微信登录',
    'qq登录',
    '手机登录',
    '立即登录',
    '登录后继续',
  ];

  return markers.some((marker) => text.includes(marker));
}

function hasLoggedInDashboardText(bodyText: string): boolean {
  const text = normalize(bodyText);
  if (!text) return false;

  const markers = [
    '内容发布',
    '内容管理',
    '素材管理',
    '评论管理',
    '数据总览',
    '收益分析',
    '账号管理',
  ];

  return markers.filter((marker) => text.includes(marker.toLowerCase())).length >= 2;
}

export function getQiehaoRestrictionReason(bodyText: string): string | null {
  const text = normalize(bodyText);
  if (!text) return null;

  if (text.includes('资质审核中') || text.includes('主体资料正在审核中') || text.includes('审核期间，部分平台功能可能无法正常使用')) {
    return '资质审核中';
  }

  if (text.includes('审核未通过') || text.includes('资质审核未通过')) {
    return '审核未通过';
  }

  if (text.includes('功能暂不可用') || text.includes('部分平台功能可能无法正常使用')) {
    return '功能受限';
  }

  return null;
}

export function isQiehaoAccountPayloadLoggedIn(payload: any): boolean {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.code === 401 || payload.code === 403) return false;

  const candidates = [payload, payload.data, payload.user, payload.currentUser].filter(Boolean);
  return candidates.some((item) => {
    if (!item || typeof item !== 'object') return false;
    return Boolean(
      item.userId ||
      item.user_id ||
      item.uid ||
      item.id ||
      item.name ||
      item.nick ||
      item.nickname ||
      item.accountName,
    );
  });
}

export async function getQiehaoPageState(session: ChromeSession): Promise<QiehaoPageState> {
  return await evaluate<QiehaoPageState>(session, `
    (() => {
      const text = document.body?.innerText || '';
      const globalUser =
        window.__INITIAL_STATE__?.user ||
        window.__INITIAL_STATE__?.account ||
        window.__STORE__?.state?.user ||
        window.__STORE__?.state?.account ||
        null;
      const restrictionReason = text.includes('资质审核中') || text.includes('主体资料正在审核中')
        ? '资质审核中'
        : text.includes('审核未通过') || text.includes('资质审核未通过')
          ? '审核未通过'
          : text.includes('部分平台功能可能无法正常使用')
            ? '功能受限'
            : null;

      return {
        url: window.location.href,
        title: document.title || '',
        bodyText: text,
        currentUser: globalUser,
        restrictionReason,
      };
    })()
  `);
}

export function isQiehaoSessionLoggedIn(state: QiehaoPageState): boolean {
  if (isQiehaoAccountPayloadLoggedIn(state.currentUser)) return true;
  if (hasLoggedInDashboardText(state.bodyText || '')) return true;
  if (hasLoggedOutText(state.bodyText || '')) return false;

  const url = state.url || '';
  if (url.includes('om.qq.com') && !url.includes('/login')) return true;
  return false;
}
