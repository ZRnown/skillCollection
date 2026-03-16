export interface PublishExpectations {
  sourceTextLength: number;
  minimumTextLength: number;
  imageCount: number;
}

export interface SaveApiResult {
  errno: number | null;
  errmsg: string;
  status: string;
  articleId: string;
  nid: string;
  publishType: string;
  previewUrl: string;
  raw: unknown;
}

export interface PreviewVerificationResult {
  titleMatched: boolean;
  textLength: number;
  imageCount: number;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function stripJsonpWrapper(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^[\w$.]+\(([\s\S]*)\)\s*;?$/);
  return match ? match[1]!.trim() : trimmed;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function stripHtmlToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

export function countHtmlImages(html: string): number {
  const urls = new Set<string>();

  for (const match of html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
    const url = decodeHtmlEntities(match[1] || '').trim();
    if (url) urls.add(url);
  }

  for (const match of html.matchAll(/https?:\/\/pics\d+\.baidu\.com\/feed\/[^\s"'<>]+/gi)) {
    urls.add(match[0]);
  }

  return urls.size;
}

export function collectPublishExpectations(html: string): PublishExpectations {
  const sourceTextLength = stripHtmlToText(html).length;
  return {
    sourceTextLength,
    minimumTextLength: Math.max(120, Math.floor(sourceTextLength * 0.35)),
    imageCount: countHtmlImages(html),
  };
}

export function buildPreviewUrl(nid: string): string {
  const normalizedNid = nid.trim();
  const cleanNid = normalizedNid && normalizedNid.startsWith('news_')
    ? normalizedNid
    : (normalizedNid ? `news_${normalizedNid}` : '');
  if (!cleanNid) return '';
  const context = encodeURIComponent(JSON.stringify({ nid: cleanNid, sourceFrom: 'bjh' }));
  return `https://mbd.baidu.com/newspage/data/landingshare?preview=1&pageType=1&isBdboxFrom=1&context=${context}`;
}

export function parseSaveApiResponse(rawBody: string): SaveApiResult {
  const payloadText = stripJsonpWrapper(rawBody);

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(payloadText) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Unable to parse Baijiahao save response: ${error instanceof Error ? error.message : String(error)}`);
  }

  const data = (payload.data && typeof payload.data === 'object')
    ? payload.data as Record<string, unknown>
    : null;
  const ret = (payload.ret && typeof payload.ret === 'object')
    ? payload.ret as Record<string, unknown>
    : null;
  const record = ret || data || payload;

  const errno = typeof payload.errno === 'number'
    ? payload.errno
    : (typeof record.errno === 'number' ? record.errno : null);
  const errmsg = asString(payload.errmsg) || asString(record.errmsg);
  const status = asString(record.status) || asString(payload.status);
  const articleId = asString(record.article_id) || asString(record.articleId) || asString(record.id);
  const nid = asString(record.nid);
  const publishType = asString(record.publish_type) || asString(record.publishType);
  const previewUrl = asString(record.url).replace(/^http:/i, 'https:') || buildPreviewUrl(nid);

  return {
    errno,
    errmsg,
    status,
    articleId,
    nid,
    publishType,
    previewUrl,
    raw: payload,
  };
}

export function analyzePreviewHtml(previewHtml: string, expectedTitle: string): PreviewVerificationResult {
  const normalizedText = stripHtmlToText(previewHtml);
  const htmlTitle = decodeHtmlEntities((previewHtml.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '').trim());
  const titleMatched = Boolean(expectedTitle)
    && (normalizedText.includes(expectedTitle) || htmlTitle.includes(expectedTitle));

  return {
    titleMatched,
    textLength: normalizedText.length,
    imageCount: countHtmlImages(previewHtml),
  };
}
