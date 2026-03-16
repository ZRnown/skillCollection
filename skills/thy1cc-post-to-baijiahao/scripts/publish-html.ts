export interface PublishHtmlAnalysis {
  remoteImageUrls: string[];
  unsupportedImageRefs: string[];
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function readAttr(tag: string, attr: string): string {
  const pattern = new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, 'i');
  const match = tag.match(pattern);
  return match ? decodeHtmlAttribute(match[1]!) : '';
}

export function analyzePublishHtml(html: string): PublishHtmlAnalysis {
  const imgTags = html.match(/<img\b[^>]*>/gi) || [];
  const remoteImageUrls: string[] = [];
  const unsupportedImageRefs: string[] = [];

  for (const tag of imgTags) {
    const src = readAttr(tag, 'src');
    const dataLocalPath = readAttr(tag, 'data-local-path');

    if (dataLocalPath) {
      unsupportedImageRefs.push(dataLocalPath);
      continue;
    }

    if (/^https?:\/\//i.test(src)) {
      remoteImageUrls.push(src);
      continue;
    }

    if (src) {
      unsupportedImageRefs.push(src);
      continue;
    }

    unsupportedImageRefs.push('<img-without-src>');
  }

  return { remoteImageUrls, unsupportedImageRefs };
}
