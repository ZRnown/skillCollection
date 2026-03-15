import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { getDefaultProfileDir, type ChromeSession, type CdpConnection, findExistingChromeDebugPort, getPageSession, launchChrome, sleep, tryConnectExisting, evaluate, typeText, waitForNewTab } from './cdp.ts';
import { getBaijiahaoPageState, isBaijiahaoSessionLoggedIn } from './baijiahao-auth.ts';
import { AUTHOR_FIELD_SELECTORS, SUMMARY_FIELD_SELECTORS, TITLE_FIELD_SELECTORS } from './baijiahao-editor-locators.ts';
import { BODY_EDITOR_SELECTORS } from './editor-candidates.ts';
import { pickActionCandidate, type ActionCandidate } from './action-targets.ts';

const BAIJIAHAO_HOME = 'https://baijiahao.baidu.com/';
const ACTION_TEXT_SELECTORS = 'button, a, [role="button"], div, span';

interface PublishOptions {
  htmlFile?: string;
  markdownFile?: string;
  title?: string;
  summary?: string;
  author?: string;
  content?: string;
  submit: boolean;
  profileDir?: string;
  cdpPort?: number;
  editorUrl?: string;
  createButtonTexts: string[];
  closeOnFailure: boolean;
}

interface ExtendConfig {
  default_author?: string;
  chrome_profile_path?: string;
  editor_url?: string;
  create_button_texts?: string;
  default_action?: string;
}

function printHelp(): void {
  console.log(`Usage:
  npx -y bun baijiahao-article.ts --html article-publish.html --title "标题" --summary "摘要"
  npx -y bun baijiahao-article.ts --markdown article-publish.md --title "标题"
  npx -y bun baijiahao-article.ts --content "正文" --title "标题"

Flags:
  --html <file>         HTML file to publish
  --markdown <file>     Markdown file; a companion HTML file is preferred
  --content <text>      Plain text fallback
  --title <text>        Article title
  --summary <text>      Article summary
  --author <text>       Author name
  --submit              Attempt final publish instead of saving draft
  --close-on-failure    Close launched Chrome even when the run fails
  --profile-dir <dir>   Override Chrome profile directory
  --cdp-port <port>     Reuse an existing Chrome debug port
  --editor-url <url>    Direct editor URL if known
  --help                Show this help
`);
}

function parseArgs(argv: string[]): PublishOptions {
  const options: PublishOptions = {
    submit: false,
    createButtonTexts: [],
    closeOnFailure: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--html':
        options.htmlFile = argv[++i];
        break;
      case '--markdown':
        options.markdownFile = argv[++i];
        break;
      case '--title':
        options.title = argv[++i];
        break;
      case '--summary':
        options.summary = argv[++i];
        break;
      case '--author':
        options.author = argv[++i];
        break;
      case '--content':
        options.content = argv[++i];
        break;
      case '--submit':
        options.submit = true;
        break;
      case '--close-on-failure':
        options.closeOnFailure = true;
        break;
      case '--profile-dir':
        options.profileDir = argv[++i];
        break;
      case '--cdp-port':
        options.cdpPort = parseInt(argv[++i], 10);
        break;
      case '--editor-url':
        options.editorUrl = argv[++i];
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function loadExtendFile(envPath: string): Record<string, string> {
  const data: Record<string, string> = {};
  if (!fs.existsSync(envPath)) return data;
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx <= 0) continue;
    const key = trimmed.slice(0, colonIdx).trim().toLowerCase();
    let value = trimmed.slice(colonIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }
  return data;
}

function loadExtendConfig(): ExtendConfig {
  const projectPath = path.join(process.cwd(), '.thy1cc-skills', 'thy1cc-post-to-baijiahao', 'EXTEND.md');
  const userPath = path.join(os.homedir(), '.thy1cc-skills', 'thy1cc-post-to-baijiahao', 'EXTEND.md');
  return {
    ...loadExtendFile(userPath),
    ...loadExtendFile(projectPath),
  };
}

function resolveDefaults(cliOptions: PublishOptions, config: ExtendConfig): PublishOptions {
  const defaultAction = (config.default_action || '').toLowerCase();
  const createButtonTexts = (config.create_button_texts || '发布内容,发文,写文章,发布,图文,文章')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    ...cliOptions,
    author: cliOptions.author || config.default_author || '',
    profileDir: cliOptions.profileDir || config.chrome_profile_path || getDefaultProfileDir(),
    editorUrl: cliOptions.editorUrl || config.editor_url || '',
    submit: cliOptions.submit || defaultAction === 'submit',
    createButtonTexts,
  };
}

function parseHtmlMeta(htmlPath: string): { title: string; author: string; summary: string } {
  const content = fs.readFileSync(htmlPath, 'utf-8');
  let title = '';
  let author = '';
  let summary = '';

  const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) title = titleMatch[1]!.trim();

  const authorMatch = content.match(/<meta\s+name=["']author["']\s+content=["']([^"']+)["']/i)
    || content.match(/<meta\s+content=["']([^"']+)["']\s+name=["']author["']/i);
  if (authorMatch) author = authorMatch[1]!.trim();

  const descMatch = content.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)
    || content.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i);
  if (descMatch) summary = descMatch[1]!.trim();

  return { title, author, summary };
}

function stripTags(value: string): string {
  return value.replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPublishHtml(htmlPath: string): string {
  const content = fs.readFileSync(htmlPath, 'utf-8');

  const outputMatch = content.match(/<[^>]+id=["']output["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
  if (outputMatch) return outputMatch[1]!.trim();

  const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) return bodyMatch[1]!.trim();

  return content.trim();
}

function markdownToHtmlFallback(markdownPath: string): string | null {
  const candidates = [
    markdownPath.replace(/\.md$/i, '.html'),
    path.join(path.dirname(markdownPath), 'article-publish.html'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function buildHtmlFromPlainText(content: string): string {
  const escaped = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

async function waitForLogin(session: ChromeSession, timeoutMs = 120_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await getBaijiahaoPageState(session);
    if (isBaijiahaoSessionLoggedIn(state)) return;
    console.log('[baijiahao] Waiting for login. Please complete any QR-code or verification flow in Chrome...');
    await sleep(2_000);
  }
  throw new Error('Login timeout');
}

async function clickFirstMatchingText(session: ChromeSession, texts: string[]): Promise<boolean> {
  const candidates = await evaluate<ActionCandidate[]>(session, `
    (function() {
      const selector = ${JSON.stringify(ACTION_TEXT_SELECTORS)};
      const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
      const ownText = (node) => Array.from(node.childNodes)
        .filter((child) => child.nodeType === Node.TEXT_NODE)
        .map((child) => child.textContent || '')
        .join(' ');

      return Array.from(document.querySelectorAll(selector))
        .filter((node) => {
          if (!(node instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return style.visibility !== 'hidden'
            && style.display !== 'none'
            && rect.width > 20
            && rect.height > 16
            && style.pointerEvents !== 'none';
        })
        .map((node, id) => {
          const rect = node.getBoundingClientRect();
          return {
            id,
            tagName: node.tagName,
            role: node.getAttribute('role') || '',
            text: normalize(node.textContent || ''),
            ownText: normalize(ownText(node)),
            area: rect.width * rect.height,
          };
        });
    })()
  `);

  const target = pickActionCandidate(candidates, texts);
  if (!target) return false;

  return await evaluate<boolean>(session, `
    (function() {
      const selector = ${JSON.stringify(ACTION_TEXT_SELECTORS)};
      const targetId = ${JSON.stringify(target.id)};
      const candidates = Array.from(document.querySelectorAll(selector))
        .filter((node) => {
          if (!(node instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return style.visibility !== 'hidden'
            && style.display !== 'none'
            && rect.width > 20
            && rect.height > 16
            && style.pointerEvents !== 'none';
        });

      const target = candidates[targetId];
      if (!(target instanceof HTMLElement)) return false;
      if (target instanceof HTMLButtonElement && target.disabled) return false;
      if (target.getAttribute('aria-disabled') === 'true') return false;

      target.scrollIntoView({ block: 'center' });
      target.click();
      return true;
    })()
  `);
}

async function fieldHintsExist(session: ChromeSession, hints: string[]): Promise<boolean> {
  return await evaluate<boolean>(session, `
    (function() {
      const hints = ${JSON.stringify(hints.map((hint) => hint.toLowerCase()))};
      const normalize = (value) => (value || '').toLowerCase();
      const nodes = Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"], [placeholder], [aria-label]'));
      return nodes.some((node) => {
        const text = [
          node.getAttribute?.('placeholder') || '',
          node.getAttribute?.('aria-label') || '',
          node.getAttribute?.('name') || '',
          node.id || '',
          node.parentElement?.textContent || '',
        ].join(' ');
        return hints.some((hint) => normalize(text).includes(hint));
      });
    })()
  `);
}

async function editorReady(session: ChromeSession): Promise<boolean> {
  const titleReady = await fieldHintsExist(session, ['标题', 'title']);
  const bodyReady = await evaluate<boolean>(session, `
    (function() {
      const selectors = [
        '.ProseMirror',
        '.ql-editor',
        '.public-DraftEditor-content',
        '[contenteditable="true"]',
        '[role="textbox"]'
      ];
      return selectors.some((selector) => {
        const nodes = document.querySelectorAll(selector);
        return Array.from(nodes).some((node) => {
          if (!(node instanceof HTMLElement)) return false;
          const rect = node.getBoundingClientRect();
          return rect.width > 300 && rect.height > 80;
        });
      });
    })()
  `);
  return titleReady || bodyReady;
}

async function fillField(session: ChromeSession, hints: string[], value: string): Promise<boolean> {
  if (!value) return false;
  return await evaluate<boolean>(session, `
    (function() {
      const hints = ${JSON.stringify(hints.map((hint) => hint.toLowerCase()))};
      const value = ${JSON.stringify(value)};
      const normalize = (input) => (input || '').toLowerCase();
      const visible = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 40 && rect.height > 16;
      };

      const scoreNode = (node) => {
        const haystack = [
          node.getAttribute?.('placeholder') || '',
          node.getAttribute?.('aria-label') || '',
          node.getAttribute?.('name') || '',
          node.id || '',
          node.parentElement?.textContent || '',
          node.previousElementSibling?.textContent || '',
        ].join(' ');
        let score = 0;
        for (const hint of hints) {
          if (normalize(haystack).includes(hint)) score += 10;
        }
        if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) score += 5;
        return score;
      };

      const nodes = Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"]')).filter(visible);
      const ranked = nodes
        .map((node) => ({ node, score: scoreNode(node) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score);

      const best = ranked[0]?.node;
      if (!best) return false;

      if (best instanceof HTMLInputElement || best instanceof HTMLTextAreaElement) {
        best.focus();
        const prototype = best instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        if (setter) setter.call(best, value);
        else best.value = value;
        best.dispatchEvent(new Event('input', { bubbles: true }));
        best.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }

      if (best instanceof HTMLElement) {
        best.focus();
        best.textContent = value;
        best.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }

      return false;
    })()
  `);
}

async function fillBySelectors(session: ChromeSession, selectors: string[], value: string): Promise<boolean> {
  if (!value || selectors.length === 0) return false;
  return await evaluate<boolean>(session, `
    (function() {
      const selectors = ${JSON.stringify(selectors)};
      const value = ${JSON.stringify(value)};
      const escapeHtml = (input) => input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const visible = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 20 && rect.height > 16;
      };

      const best = selectors
        .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .find((node) => visible(node));

      if (!(best instanceof HTMLElement)) return false;

      if (best instanceof HTMLInputElement || best instanceof HTMLTextAreaElement) {
        best.focus();
        best.value = value;
        best.dispatchEvent(new Event('input', { bubbles: true }));
        best.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }

      if (best.getAttribute('contenteditable') === 'true') {
        best.focus();
        if (best.getAttribute('data-lexical-editor') === 'true') {
          best.innerHTML = '<p dir="auto">' + escapeHtml(value) + '</p>';
        } else {
          best.textContent = value;
        }
        best.dispatchEvent(new Event('input', { bubbles: true }));
        best.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }

      return false;
    })()
  `);
}

async function typeIntoContenteditableSelectors(session: ChromeSession, selectors: string[], value: string): Promise<boolean> {
  if (!value || selectors.length === 0) return false;

  const prepared = await evaluate<boolean>(session, `
    (function() {
      const selectors = ${JSON.stringify(selectors)};
      const visible = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 20 && rect.height > 16;
      };

      const best = selectors
        .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .find((node) => node instanceof HTMLElement && node.getAttribute('contenteditable') === 'true' && visible(node));

      if (!(best instanceof HTMLElement)) return false;

      best.focus();
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(best);
        selection.removeAllRanges();
        selection.addRange(range);
      }

      return true;
    })()
  `);

  if (!prepared) return false;
  await sleep(100);
  await typeText(session, value);
  return true;
}

async function typeIntoTextControlSelectors(session: ChromeSession, selectors: string[], value: string): Promise<boolean> {
  if (!value || selectors.length === 0) return false;

  const prepared = await evaluate<boolean>(session, `
    (function() {
      const selectors = ${JSON.stringify(selectors)};
      const visible = (node) => {
        if (!(node instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 20 && rect.height > 16;
      };

      const best = selectors
        .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .find((node) => (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) && visible(node));

      if (!(best instanceof HTMLInputElement || best instanceof HTMLTextAreaElement)) return false;

      best.focus();
      if (typeof best.select === 'function') best.select();
      return document.activeElement === best;
    })()
  `);

  if (!prepared) return false;
  await sleep(100);
  await typeText(session, value);
  return true;
}

async function injectHtml(session: ChromeSession, html: string): Promise<{ ok: boolean; detail: string }> {
  const plainText = stripTags(html);
  return await evaluate<{ ok: boolean; detail: string }>(session, `
    (function() {
      const html = ${JSON.stringify(html)};
      const plainText = ${JSON.stringify(plainText)};
      const selectors = ${JSON.stringify(BODY_EDITOR_SELECTORS)};
      const visible = (node) => {
        if (!(node instanceof Element)) return false;
        const rect = node.getBoundingClientRect();
        if (node instanceof HTMLElement) {
          const style = window.getComputedStyle(node);
          return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 250 && rect.height > 80;
        }
        return rect.width > 250 && rect.height > 80;
      };

      const candidates = selectors
        .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
        .filter(visible);

      const best = candidates
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return { node, area: rect.width * rect.height };
        })
        .sort((a, b) => b.area - a.area)[0]?.node;

      if (!best) return { ok: false, detail: 'No editor candidate found' };

      if (best instanceof HTMLIFrameElement) {
        const doc = best.contentDocument || best.contentWindow?.document;
        if (!doc || !doc.body) return { ok: false, detail: 'Iframe editor body unavailable' };

        doc.body.focus();
        doc.body.innerHTML = html;
        doc.body.dispatchEvent(new Event('input', { bubbles: true }));
        doc.body.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, detail: 'Set innerHTML inside iframe editor body' };
      }

      if (best instanceof HTMLTextAreaElement) {
        best.focus();
        best.value = plainText;
        best.dispatchEvent(new Event('input', { bubbles: true }));
        best.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, detail: 'Injected plain text into textarea' };
      }

      if (best instanceof HTMLElement) {
        best.focus();
        try {
          const selection = window.getSelection();
          if (selection) {
            const range = document.createRange();
            range.selectNodeContents(best);
            selection.removeAllRanges();
            selection.addRange(range);
          }
          if (document.execCommand) {
            document.execCommand('selectAll', false);
            document.execCommand('delete', false);
            const inserted = document.execCommand('insertHTML', false, html);
            if (inserted) {
              best.dispatchEvent(new Event('input', { bubbles: true }));
              return { ok: true, detail: 'Inserted HTML via execCommand' };
            }
          }
        } catch {}

        best.innerHTML = html;
        best.dispatchEvent(new Event('input', { bubbles: true }));
        best.dispatchEvent(new Event('change', { bubbles: true }));
        return { ok: true, detail: 'Set innerHTML on editor candidate' };
      }

      return { ok: false, detail: 'Unsupported editor element' };
    })()
  `);
}

async function clickAction(session: ChromeSession, labels: string[]): Promise<boolean> {
  return await clickFirstMatchingText(session, labels);
}

async function attachSessionToTarget(cdp: CdpConnection, targetId: string): Promise<ChromeSession> {
  const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, { sessionId });
  await cdp.send('Runtime.enable', {}, { sessionId });
  await cdp.send('DOM.enable', {}, { sessionId });
  return { cdp, sessionId, targetId };
}

async function openEditor(cdp: CdpConnection, session: ChromeSession, options: PublishOptions): Promise<ChromeSession> {
  if (options.editorUrl) {
    console.log(`[baijiahao] Navigating to configured editor URL: ${options.editorUrl}`);
    await evaluate(session, `window.location.href = ${JSON.stringify(options.editorUrl)}`);
    await sleep(5_000);
    return session;
  }

  console.log('[baijiahao] Trying heuristic create-button flow...');
  const initialTargets = await cdp.send<{ targetInfos: Array<{ targetId: string }> }>('Target.getTargets');
  const initialIds = new Set(initialTargets.targetInfos.map((target) => target.targetId));

  const clicked = await clickFirstMatchingText(session, options.createButtonTexts);
  if (!clicked) throw new Error('Could not find a Baijiahao create/publish button. Configure editor_url or create_button_texts in EXTEND.md.');

  await sleep(4_000);
  try {
    const newTargetId = await waitForNewTab(cdp, initialIds, 'baijiahao.baidu.com', 8_000);
    console.log('[baijiahao] Editor opened in a new tab.');
    return await attachSessionToTarget(cdp, newTargetId);
  } catch {
    console.log('[baijiahao] No new tab detected. Reusing current tab.');
    return session;
  }
}

async function main(): Promise<void> {
  const cliOptions = parseArgs(process.argv.slice(2));
  const config = loadExtendConfig();
  const options = resolveDefaults(cliOptions, config);

  let html = '';
  let title = options.title || '';
  let summary = options.summary || '';
  let author = options.author || '';

  if (options.htmlFile) {
    const meta = parseHtmlMeta(options.htmlFile);
    title = title || meta.title;
    summary = summary || meta.summary;
    author = author || meta.author;
    html = extractPublishHtml(options.htmlFile);
  } else if (options.markdownFile) {
    const htmlPath = markdownToHtmlFallback(options.markdownFile);
    if (!htmlPath) {
      throw new Error('Markdown provided without companion HTML. Prepare article-publish.html first or pass --html directly.');
    }
    const meta = parseHtmlMeta(htmlPath);
    title = title || meta.title;
    summary = summary || meta.summary;
    author = author || meta.author;
    html = extractPublishHtml(htmlPath);
  } else if (options.content) {
    html = buildHtmlFromPlainText(options.content);
  } else {
    throw new Error('Provide --html, --markdown, or --content.');
  }

  if (!title) throw new Error('Missing title. Pass --title or provide it in HTML metadata.');
  if (!summary) {
    const fallback = stripTags(html).slice(0, 110).trim();
    summary = fallback.length > 100 ? `${fallback.slice(0, 97)}...` : fallback;
  }

  let cdp: CdpConnection;
  let chrome: ReturnType<typeof import('node:child_process').spawn> | null = null;
  let runError: unknown = null;

  const portToTry = options.cdpPort ?? await findExistingChromeDebugPort();
  if (portToTry) {
    const existing = await tryConnectExisting(portToTry);
    if (existing) {
      console.log(`[cdp] Connected to existing Chrome on port ${portToTry}`);
      cdp = existing;
    } else {
      const launched = await launchChrome(BAIJIAHAO_HOME, options.profileDir);
      cdp = launched.cdp;
      chrome = launched.chrome;
    }
  } else {
    const launched = await launchChrome(BAIJIAHAO_HOME, options.profileDir);
    cdp = launched.cdp;
    chrome = launched.chrome;
  }

  try {
    await sleep(3_000);

    let session: ChromeSession;
    if (!chrome) {
      const targets = await cdp.send<{ targetInfos: Array<{ targetId: string; url: string; type: string }> }>('Target.getTargets');
      const existingTab = targets.targetInfos.find((target) => target.type === 'page' && target.url.includes('baijiahao.baidu.com'));
      if (existingTab) {
        session = await attachSessionToTarget(cdp, existingTab.targetId);
      } else {
        await cdp.send('Target.createTarget', { url: BAIJIAHAO_HOME });
        await sleep(5_000);
        session = await getPageSession(cdp, 'baijiahao.baidu.com');
      }
    } else {
      session = await getPageSession(cdp, 'baijiahao.baidu.com');
    }

    const initialState = await getBaijiahaoPageState(session);
    if (!isBaijiahaoSessionLoggedIn(initialState)) {
      console.log('[baijiahao] Not logged in yet. Please log into Baijiahao in Chrome.');
      await waitForLogin(session);
    }
    console.log('[baijiahao] Login confirmed.');

    session = await openEditor(cdp, session, options);

    const readyStart = Date.now();
    while (Date.now() - readyStart < 20_000) {
      if (await editorReady(session)) break;
      await sleep(1_000);
    }

    const titleFilled = await typeIntoContenteditableSelectors(session, TITLE_FIELD_SELECTORS, title)
      || await fillBySelectors(session, TITLE_FIELD_SELECTORS, title)
      || await fillField(session, ['标题', 'title'], title);
    const summaryFilled = await typeIntoTextControlSelectors(session, SUMMARY_FIELD_SELECTORS, summary)
      || await fillBySelectors(session, SUMMARY_FIELD_SELECTORS, summary)
      || await fillField(session, ['摘要', 'summary', '简介'], summary);
    const authorFilled = author ? (
      await typeIntoTextControlSelectors(session, AUTHOR_FIELD_SELECTORS, author)
      || await fillBySelectors(session, AUTHOR_FIELD_SELECTORS, author)
    ) : false;
    const bodyResult = await injectHtml(session, html);

    console.log(`[baijiahao] Title filled: ${titleFilled}`);
    console.log(`[baijiahao] Summary filled: ${summaryFilled}`);
    console.log(`[baijiahao] Author filled: ${authorFilled}`);
    console.log(`[baijiahao] Body result: ${bodyResult.detail}`);

    await sleep(2_000);

    if (options.submit) {
      const clicked = await clickAction(session, ['发布', '确认发布', '提交发布', '立即发布']);
      if (!clicked) throw new Error('Publish button not found. The page may require manual confirmation.');
      console.log('[baijiahao] Publish click dispatched. Watch Chrome for any secondary confirmation dialog.');
    } else {
      const clicked = await clickAction(session, ['存草稿', '保存草稿', '保存为草稿', '保存', '草稿']);
      if (!clicked) throw new Error('Draft-save button not found.');
      console.log('[baijiahao] Draft-save click dispatched.');
    }

    await sleep(3_000);
  } catch (error) {
    runError = error;
    throw error;
  } finally {
    cdp.close();
    const keepChromeOpen = Boolean(chrome && runError && !options.closeOnFailure);
    if (keepChromeOpen) {
      console.error(`[baijiahao] Keeping launched Chrome open for reuse. Profile: ${options.profileDir}`);
    } else if (chrome) {
      chrome.kill();
    }
  }
}

await main().catch((error) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
