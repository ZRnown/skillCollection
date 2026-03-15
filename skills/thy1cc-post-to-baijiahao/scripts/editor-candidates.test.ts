import { expect, test } from 'bun:test';
import { BODY_EDITOR_SELECTORS } from './editor-candidates.ts';

test('body editor selectors include the Baijiahao UEditor iframe', () => {
  expect(BODY_EDITOR_SELECTORS).toContain('iframe#ueditor_0');
});
