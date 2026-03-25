import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getQiehaoRestrictionReason,
  isQiehaoAccountPayloadLoggedIn,
  isQiehaoSessionLoggedIn,
} from './qiehao-auth.ts';

test('isQiehaoAccountPayloadLoggedIn handles common logged-in payloads', () => {
  assert.equal(isQiehaoAccountPayloadLoggedIn({ data: { userId: '1001' } }), true);
  assert.equal(isQiehaoAccountPayloadLoggedIn({ code: 401 }), false);
});

test('isQiehaoSessionLoggedIn recognizes dashboard markers', () => {
  const ok = isQiehaoSessionLoggedIn({
    url: 'https://om.qq.com/main',
    title: '腾讯内容开放平台',
    bodyText: '内容发布 内容管理 素材管理 数据总览 收益分析 账号管理',
    currentUser: null,
    restrictionReason: null,
  });
  assert.equal(ok, true);
});

test('isQiehaoSessionLoggedIn treats scan-login page as logged out', () => {
  const ok = isQiehaoSessionLoggedIn({
    url: 'https://om.qq.com/login',
    title: '腾讯内容开放平台',
    bodyText: '扫码登录 微信登录 QQ登录',
    currentUser: null,
    restrictionReason: null,
  });
  assert.equal(ok, false);
});

test('getQiehaoRestrictionReason detects qualification review status', () => {
  const reason = getQiehaoRestrictionReason(
    '亲爱的腾讯内容开放平台作者，您的主体资料正在审核中，我们将尽快给您反馈审核结果。审核期间，部分平台功能可能无法正常使用。资质审核中',
  );
  assert.equal(reason, '资质审核中');
});
