export const TITLE_FIELD_SELECTORS = [
  '[data-lexical-editor="true"]',
  '[contenteditable="true"][data-lexical-editor="true"]',
  'textarea[placeholder*="标题"]',
  'input[placeholder*="标题"]',
];

export const SUMMARY_FIELD_SELECTORS = [
  'textarea#abstract',
  'textarea[placeholder*="摘要"]',
  'textarea[placeholder*="简介"]',
];

export const AUTHOR_FIELD_SELECTORS = [
  'input[placeholder*="作者"]',
  'textarea[placeholder*="作者"]',
  'input[aria-label*="作者"]',
  'textarea[aria-label*="作者"]',
  'input[name="author"]',
];
