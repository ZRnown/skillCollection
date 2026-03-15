import { expect, test } from 'bun:test';
import { isBaijiahaoSessionLoggedIn } from './baijiahao-auth.ts';

test('treats the logged-in Baijiahao dashboard as authenticated even when body text contains task-card login wording', () => {
  const loggedIn = isBaijiahaoSessionLoggedIn({
    url: 'https://baijiahao.baidu.com/',
    bodyText: `发布作品
内容管理
数据中心
个人中心
登录百家号
已完成`,
    currentUser: {},
  });

  expect(loggedIn).toBe(true);
});

test('treats QR-code login prompts as logged out', () => {
  const loggedIn = isBaijiahaoSessionLoggedIn({
    url: 'https://baijiahao.baidu.com/',
    bodyText: '扫码登录 注册百家号',
    currentUser: null,
  });

  expect(loggedIn).toBe(false);
});
