import { expect, test } from 'bun:test';
import { analyzePreviewHtml, buildPreviewUrl, collectPublishExpectations, parseSaveApiResponse } from './publish-verification.ts';

test('parseSaveApiResponse handles JSONP save payloads', () => {
  const parsed = parseSaveApiResponse('bjhdraft({"errno":0,"errmsg":"success","data":{"status":"draft","article_id":"1859745119182065013","nid":"news_10215286680971555023","publish_type":"news"}})');

  expect(parsed.errno).toBe(0);
  expect(parsed.status).toBe('draft');
  expect(parsed.articleId).toBe('1859745119182065013');
  expect(parsed.nid).toBe('news_10215286680971555023');
  expect(parsed.publishType).toBe('news');
  expect(parsed.previewUrl).toContain('preview=1');
  expect(parsed.previewUrl).toContain('news_10215286680971555023');
});

test('parseSaveApiResponse supports Baijiahao ret payloads with preview url', () => {
  const parsed = parseSaveApiResponse('{"errno":0,"errmsg":"success","data":null,"ret":{"status":"draft","article_id":"1859795452973012305","nid":"9662123690832176205","url":"http://baijiahao.baidu.com/builder/preview/s?id=9662123690832176205"}}');

  expect(parsed.errno).toBe(0);
  expect(parsed.status).toBe('draft');
  expect(parsed.articleId).toBe('1859795452973012305');
  expect(parsed.nid).toBe('9662123690832176205');
  expect(parsed.previewUrl).toBe('https://baijiahao.baidu.com/builder/preview/s?id=9662123690832176205');
});

test('collectPublishExpectations derives text and image thresholds from source html', () => {
  const html = `
    <div>
      <p>这是一段足够长的测试正文，用来验证正文长度阈值会按比例计算，而不是写死一个数字。</p>
      <img src="https://example.com/a.jpg">
      <img src="https://example.com/b.jpg">
    </div>
  `;

  const expectations = collectPublishExpectations(html);

  expect(expectations.sourceTextLength).toBeGreaterThan(20);
  expect(expectations.minimumTextLength).toBeGreaterThanOrEqual(120);
  expect(expectations.imageCount).toBe(2);
});

test('analyzePreviewHtml checks title presence and preview image count', () => {
  const previewHtml = `
    <html>
      <head><title>百家号 - 美以拦截弹承压</title></head>
      <body>
        <article>
          <h1>美以拦截弹承压</h1>
          <p>正文一</p>
          <p>正文二</p>
          <img src="https://pics1.baidu.com/feed/test-a.jpeg">
          <img src="https://pics2.baidu.com/feed/test-b.jpeg">
        </article>
      </body>
    </html>
  `;

  const analysis = analyzePreviewHtml(previewHtml, '美以拦截弹承压');

  expect(analysis.titleMatched).toBe(true);
  expect(analysis.textLength).toBeGreaterThan(10);
  expect(analysis.imageCount).toBe(2);
});

test('buildPreviewUrl returns empty string for empty nid', () => {
  expect(buildPreviewUrl('')).toBe('');
});

test('buildPreviewUrl prefixes numeric nid with news_', () => {
  expect(buildPreviewUrl('9662123690832176205')).toContain('news_9662123690832176205');
});
