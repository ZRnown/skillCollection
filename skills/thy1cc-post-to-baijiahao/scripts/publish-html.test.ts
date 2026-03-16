import { expect, test } from 'bun:test';
import { analyzePublishHtml } from './publish-html.ts';

test('accepts remote images in publish html', () => {
  const result = analyzePublishHtml(`
    <p>hello</p>
    <img src="https://example.com/a.jpg" alt="a">
    <p>world</p>
    <img src="http://example.com/b.png" alt="b">
  `);

  expect(result.remoteImageUrls).toEqual([
    'https://example.com/a.jpg',
    'http://example.com/b.png',
  ]);
  expect(result.unsupportedImageRefs).toEqual([]);
});

test('flags markdown-to-html local placeholder images as unsupported', () => {
  const result = analyzePublishHtml(`
    <p>hello</p>
    <img src="MDTOHTMLIMGPH_1" data-local-path="/tmp/a.png">
    <p>world</p>
  `);

  expect(result.remoteImageUrls).toEqual([]);
  expect(result.unsupportedImageRefs).toEqual(['/tmp/a.png']);
});

test('flags relative image paths as unsupported', () => {
  const result = analyzePublishHtml(`
    <p>hello</p>
    <img src="./imgs/a.png">
  `);

  expect(result.unsupportedImageRefs).toEqual(['./imgs/a.png']);
});
