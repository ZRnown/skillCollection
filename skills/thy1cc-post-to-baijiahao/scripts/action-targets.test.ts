import { expect, test } from 'bun:test';
import { pickActionCandidate, type ActionCandidate } from './action-targets.ts';

function candidate(overrides: Partial<ActionCandidate>): ActionCandidate {
  return {
    id: 1,
    tagName: 'DIV',
    role: '',
    text: '',
    ownText: '',
    area: 1_000,
    ...overrides,
  };
}

test('prefers a semantic button over a page-sized container that only includes the label', () => {
  const selected = pickActionCandidate([
    candidate({
      id: 10,
      tagName: 'DIV',
      text: '图文 视频 动态 存草稿 预览 发布',
      ownText: '',
      area: 900_000,
    }),
    candidate({
      id: 20,
      tagName: 'BUTTON',
      text: '存草稿',
      ownText: '存草稿',
      area: 2_736,
    }),
  ], ['存草稿']);

  expect(selected?.id).toBe(20);
});

test('prefers the button wrapper over its inner span for the same exact label', () => {
  const selected = pickActionCandidate([
    candidate({
      id: 30,
      tagName: 'SPAN',
      text: '存草稿',
      ownText: '存草稿',
      area: 924,
    }),
    candidate({
      id: 40,
      tagName: 'BUTTON',
      text: '存草稿',
      ownText: '',
      area: 2_736,
    }),
  ], ['存草稿']);

  expect(selected?.id).toBe(40);
});
