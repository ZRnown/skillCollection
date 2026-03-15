import { expect, test } from 'bun:test';
import { SUMMARY_FIELD_SELECTORS, TITLE_FIELD_SELECTORS } from './baijiahao-editor-locators.ts';

test('title locators include the lexical title editor', () => {
  expect(TITLE_FIELD_SELECTORS).toContain('[data-lexical-editor="true"]');
});

test('summary locators include the abstract textarea', () => {
  expect(SUMMARY_FIELD_SELECTORS).toContain('textarea#abstract');
});
