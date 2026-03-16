function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractElementInnerHtmlById(documentHtml: string, id: string): string | null {
  const openTagPattern = new RegExp(`<([a-zA-Z0-9:-]+)\\b[^>]*\\bid=["']${escapeRegExp(id)}["'][^>]*>`, 'i');
  const openMatch = openTagPattern.exec(documentHtml);
  if (!openMatch) return null;

  const tagName = openMatch[1]!.toLowerCase();
  const contentStart = openMatch.index + openMatch[0].length;

  const openPattern = new RegExp(`<${tagName}\\b[^>]*>`, 'ig');
  const closePattern = new RegExp(`</${tagName}>`, 'ig');
  openPattern.lastIndex = contentStart;
  closePattern.lastIndex = contentStart;

  let depth = 1;
  let cursor = contentStart;

  while (depth > 0) {
    openPattern.lastIndex = cursor;
    closePattern.lastIndex = cursor;
    const nextOpen = openPattern.exec(documentHtml);
    const nextClose = closePattern.exec(documentHtml);

    if (!nextClose) return null;

    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      cursor = nextOpen.index + nextOpen[0].length;
      continue;
    }

    depth -= 1;
    if (depth === 0) {
      return documentHtml.slice(contentStart, nextClose.index).trim();
    }
    cursor = nextClose.index + nextClose[0].length;
  }

  return null;
}

export function extractPublishHtmlFromDocument(documentHtml: string): string {
  const outputHtml = extractElementInnerHtmlById(documentHtml, 'output');
  if (outputHtml) return outputHtml;

  const bodyMatch = documentHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) return bodyMatch[1]!.trim();

  return documentHtml.trim();
}
