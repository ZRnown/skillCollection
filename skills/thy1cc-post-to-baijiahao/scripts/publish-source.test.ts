import { expect, test } from 'bun:test';
import { extractPublishHtmlFromDocument } from './publish-source.ts';

test('extractPublishHtmlFromDocument keeps all nested content inside #output', () => {
  const html = `
    <html>
      <body>
        <div id="output">
          <p>第一段</p>
          <figure>
            <img src="https://example.com/a.jpg" alt="a">
            <figcaption>图注</figcaption>
          </figure>
          <p>第二段</p>
        </div>
      </body>
    </html>
  `;

  const extracted = extractPublishHtmlFromDocument(html);

  expect(extracted).toContain('<p>第一段</p>');
  expect(extracted).toContain('<figure>');
  expect(extracted).toContain('<p>第二段</p>');
  expect(extracted.startsWith('<p>第一段</p>')).toBe(true);
});
