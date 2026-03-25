import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import type { ChildProcess } from 'node:child_process';

import {
  attachSessionToTarget,
  evaluate,
  findExistingChromeDebugPort,
  getDefaultProfileDir,
  getPageSession,
  launchChrome,
  sleep,
  tryConnectExisting,
  type ChromeSession,
  type CdpConnection,
} from './cdp.ts';
import { getQiehaoPageState, getQiehaoRestrictionReason, isQiehaoSessionLoggedIn } from './qiehao-auth.ts';

const QIEHAO_HOME = 'https://om.qq.com/';
const DEFAULT_EDITOR_URL = 'https://om.qq.com/article/articlePublish';
const DEFAULT_MANAGE_URL = 'https://om.qq.com/article/articleManage';
const ARTICLE_SAVE_PATH = '/article/save';
const ARTICLE_PUBLISH_PATH = '/article/publish';
const ARTICLE_LIST_PATH = '/article/list?index=';
const ARTICLE_INFO_PATH = '/article/info';
const QUALIFICATION_REVIEW_MARKERS = ['资质审核中', '主体资料正在审核中'];
const PRIMARY_TITLE_SELECTOR = '.omui-articletitle__input1 .omui-inputautogrowing__inner';
const BODY_EDITOR_SELECTOR = '.ProseMirror.ExEditor-basic';
const SUMMARY_SELECTOR = 'textarea[placeholder="请输入摘要"]';
const DRAFT_BUTTON_TEXT = '存草稿';
const SAVED_MARKER_TEXT = '已保存';

interface PublishOptions {
  htmlFile?: string;
  markdownFile?: string;
  content?: string;
  title?: string;
  profileDir?: string;
  cdpPort?: number;
  editorUrl?: string;
  closeOnFailure: boolean;
  probeOnly: boolean;
  text: boolean;
}

interface ExtendConfig {
  chrome_profile_path?: string;
  editor_url?: string;
}

interface PreparedInput {
  sourceKind: 'html' | 'markdown' | 'content' | 'none';
  title: string;
  titleOriginal: string;
  html: string;
  textLength: number;
  htmlLength: number;
  sourcePath?: string;
}

interface ProbeSummary {
  url: string;
  title: string;
  loggedIn: boolean;
  restrictionReason: string | null;
  titleFieldPresent: boolean;
  bodyExcerpt: string;
}

interface DraftSaveSummary {
  ok: boolean;
  reason: string | null;
  titleText: string;
  bodyText: string;
  draftDisabled: boolean;
  draftClass: string;
  saved: boolean;
  saveMarkerText: string | null;
  wordCount: number | null;
}

function printHelp(): void {
  console.log(`Qiehao Article Probe

Usage:
  node --experimental-strip-types qiehao-article.ts --probe-only
  node --experimental-strip-types qiehao-article.ts --html article-publish.html --title "标题"
  node --experimental-strip-types qiehao-article.ts --markdown article-publish.md --title "标题"
  node --experimental-strip-types qiehao-article.ts --content "正文" --title "标题"

Flags:
  --html <file>         HTML file to prepare
  --markdown <file>     Markdown file; a companion HTML file is preferred
  --content <text>      Plain text fallback
  --title <text>        Override article title
  --profile-dir <dir>   Override Chrome user-data-dir
  --cdp-port <port>     Reuse an existing Chrome debug port
  --editor-url <url>    Override article publish URL
  --probe-only          Only check login, account gating, and editor reachability
  --text                Print a short human-readable line instead of JSON
  --close-on-failure    Close launched Chrome if the run fails
  --help                Show this help

Known routes:
  ${DEFAULT_EDITOR_URL}
  ${DEFAULT_MANAGE_URL}
  ${ARTICLE_SAVE_PATH}
  ${ARTICLE_PUBLISH_PATH}
  ${ARTICLE_LIST_PATH}
  ${ARTICLE_INFO_PATH}
`);
}

function parseArgs(argv: string[]): PublishOptions {
  const options: PublishOptions = {
    closeOnFailure: false,
    probeOnly: false,
    text: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--html':
        options.htmlFile = argv[++i];
        break;
      case '--markdown':
        options.markdownFile = argv[++i];
        break;
      case '--content':
        options.content = argv[++i];
        break;
      case '--title':
        options.title = argv[++i];
        break;
      case '--profile-dir':
        options.profileDir = argv[++i];
        break;
      case '--cdp-port':
        options.cdpPort = Number.parseInt(argv[++i] || '', 10);
        break;
      case '--editor-url':
        options.editorUrl = argv[++i];
        break;
      case '--probe-only':
        options.probeOnly = true;
        break;
      case '--text':
        options.text = true;
        break;
      case '--close-on-failure':
        options.closeOnFailure = true;
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

function loadExtendFile(filePath: string): ExtendConfig {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const parsed: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf(':');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim().toLowerCase();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }

  return {
    chrome_profile_path: parsed.chrome_profile_path,
    editor_url: parsed.editor_url,
  };
}

function loadExtendConfig(): ExtendConfig {
  const project = path.join(process.cwd(), '.thy1cc-skills', 'thy1cc-post-to-qiehao', 'EXTEND.md');
  const user = path.join(os.homedir(), '.thy1cc-skills', 'thy1cc-post-to-qiehao', 'EXTEND.md');
  return {
    ...loadExtendFile(user),
    ...loadExtendFile(project),
  };
}

function resolveDefaults(options: PublishOptions, config: ExtendConfig): PublishOptions {
  return {
    ...options,
    profileDir: options.profileDir || config.chrome_profile_path || getDefaultProfileDir(),
    editorUrl: options.editorUrl || config.editor_url || DEFAULT_EDITOR_URL,
  };
}

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

function extractPublishHtmlFromDocument(documentHtml: string): string {
  const outputHtml = extractElementInnerHtmlById(documentHtml, 'output');
  if (outputHtml) return outputHtml;
  const bodyMatch = documentHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) return bodyMatch[1]!.trim();
  return documentHtml.trim();
}

function parseHtmlMeta(documentHtml: string): { title: string } {
  const titleMatch = documentHtml.match(/<title>([^<]+)<\/title>/i);
  return {
    title: titleMatch ? titleMatch[1]!.trim() : '',
  };
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
  return escaped
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function firstMarkdownHeading(markdown: string): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1]!.trim() : '';
}

function prepareInput(options: PublishOptions): PreparedInput {
  if (options.htmlFile) {
    const file = path.resolve(options.htmlFile);
    const documentHtml = fs.readFileSync(file, 'utf8');
    const extracted = extractPublishHtmlFromDocument(documentHtml);
    const title = (options.title || parseHtmlMeta(documentHtml).title || path.basename(file, path.extname(file))).trim();
    const plainText = htmlToPlainText(extracted);
    return {
      sourceKind: 'html',
      title,
      titleOriginal: title,
      html: extracted,
      textLength: plainText.length,
      htmlLength: extracted.length,
      sourcePath: file,
    };
  }

  if (options.markdownFile) {
    const file = path.resolve(options.markdownFile);
    const markdown = fs.readFileSync(file, 'utf8');
    const companionHtml = markdownToHtmlFallback(file);
    const htmlContent = companionHtml
      ? extractPublishHtmlFromDocument(fs.readFileSync(companionHtml, 'utf8'))
      : buildHtmlFromPlainText(markdown);
    const title = (options.title || firstMarkdownHeading(markdown) || path.basename(file, path.extname(file))).trim();
    const plainText = htmlToPlainText(htmlContent);
    return {
      sourceKind: 'markdown',
      title,
      titleOriginal: title,
      html: htmlContent,
      textLength: plainText.length,
      htmlLength: htmlContent.length,
      sourcePath: companionHtml || file,
    };
  }

  if (typeof options.content === 'string') {
    const title = (options.title || '').trim();
    const html = buildHtmlFromPlainText(options.content);
    return {
      sourceKind: 'content',
      title,
      titleOriginal: title,
      html,
      textLength: options.content.trim().length,
      htmlLength: html.length,
    };
  }

  return {
    sourceKind: 'none',
    title: '',
    titleOriginal: '',
    html: '',
    textLength: 0,
    htmlLength: 0,
  };
}

async function waitForLogin(session: ChromeSession, timeoutMs = 180_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await getQiehaoPageState(session);
    if (isQiehaoSessionLoggedIn(state)) return;
    await sleep(2_000);
  }
  throw new Error('Login timeout. Please open the Qiehao dashboard and log in first.');
}

async function ensureQiehaoSession(cdp: CdpConnection): Promise<ChromeSession> {
  try {
    return await getPageSession(cdp, 'om.qq.com');
  } catch {
    const created = await cdp.send<{ targetId: string }>('Target.createTarget', { url: QIEHAO_HOME });
    await sleep(4_000);
    return await attachSessionToTarget(cdp, created.targetId);
  }
}

async function openFreshComposeSession(cdp: CdpConnection, editorUrl: string): Promise<ChromeSession> {
  const created = await cdp.send<{ targetId: string }>('Target.createTarget', { url: editorUrl });
  await sleep(4_000);
  return await attachSessionToTarget(cdp, created.targetId);
}

function isEditorReachableUrl(url: string): boolean {
  return url.includes('/article/articlePublish') || url.includes('/main/creation/article');
}

async function detectTitleField(session: ChromeSession): Promise<boolean> {
  return await evaluate<boolean>(session, `
    (() => !!document.querySelector('${PRIMARY_TITLE_SELECTOR}, textarea[placeholder*="标题"], input[placeholder*="标题"], [data-placeholder*="标题"]'))()
  `);
}

async function probeEditorAccess(session: ChromeSession, timeoutMs = 15_000): Promise<ProbeSummary> {
  const start = Date.now();
  let lastState = await getQiehaoPageState(session);
  let titleFieldPresent = false;

  while (Date.now() - start < timeoutMs) {
    lastState = await getQiehaoPageState(session);
    titleFieldPresent = await detectTitleField(session).catch(() => false);
    if (lastState.restrictionReason || titleFieldPresent || lastState.url.includes('/article/articlePublish')) {
      break;
    }
    await sleep(1_000);
  }

  return {
    url: lastState.url,
    title: lastState.title,
    loggedIn: isQiehaoSessionLoggedIn(lastState),
    restrictionReason: lastState.restrictionReason || getQiehaoRestrictionReason(lastState.bodyText),
    titleFieldPresent,
    bodyExcerpt: lastState.bodyText.replace(/\s+/g, ' ').trim().slice(0, 240),
  };
}

async function saveDraftInEditor(session: ChromeSession, prepared: PreparedInput): Promise<DraftSaveSummary> {
  const titleJson = JSON.stringify(prepared.title);
  const htmlJson = JSON.stringify(prepared.html);
  const summaryJson = JSON.stringify(htmlToPlainText(prepared.html).slice(0, 120));
  const textJson = JSON.stringify(htmlToPlainText(prepared.html).slice(0, 1_000));

  return await evaluate<DraftSaveSummary>(session, `
    (async () => {
      const title = document.querySelector('${PRIMARY_TITLE_SELECTOR}');
      const body = document.querySelector('${BODY_EDITOR_SELECTOR}');
      const summary = document.querySelector('${SUMMARY_SELECTOR}');
      const draftButton = Array.from(document.querySelectorAll('button')).find((btn) => (btn.innerText || '').includes('${DRAFT_BUTTON_TEXT}'));

      if (!title || !body || !draftButton) {
        return {
          ok: false,
          reason: 'missing title/body/button',
          titleText: '',
          bodyText: '',
          draftDisabled: false,
          draftClass: '',
          saved: false,
          saveMarkerText: null,
          wordCount: null,
        };
      }

      title.focus();
      title.textContent = '';
      title.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
      title.textContent = ${titleJson};
      title.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${titleJson} }));

      if (summary && !summary.value.trim()) {
        summary.value = ${summaryJson};
        summary.dispatchEvent(new Event('input', { bubbles: true }));
        summary.dispatchEvent(new Event('change', { bubbles: true }));
      }

      body.focus();
      body.innerHTML = ${htmlJson};
      body.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: ${textJson} }));

      draftButton.click();
      await new Promise((resolve) => setTimeout(resolve, 5_000));

      const fullText = document.body?.innerText || '';
      const wordCountMatch = fullText.match(/正文字数：(\\d+)/);
      const saved = fullText.includes('${SAVED_MARKER_TEXT}');

      return {
        ok: saved,
        reason: saved ? null : 'save marker missing',
        titleText: title.textContent || '',
        bodyText: body.innerText || '',
        draftDisabled: Boolean(draftButton.disabled),
        draftClass: draftButton.className || '',
        saved,
        saveMarkerText: saved ? '${SAVED_MARKER_TEXT}' : null,
        wordCount: wordCountMatch ? Number(wordCountMatch[1]) : null,
      };
    })()
  `);
}

function renderOutput(payload: Record<string, unknown>, text: boolean): void {
  if (!text) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const parts = [
    `ok=${String(payload.ok)}`,
    typeof payload.currentUrl === 'string' ? `url=${payload.currentUrl}` : null,
    typeof payload.restrictionReason === 'string' && payload.restrictionReason ? `restriction=${payload.restrictionReason}` : null,
    payload.titleFieldPresent === true ? 'titleField=present' : payload.titleFieldPresent === false ? 'titleField=missing' : null,
    payload.saved === true ? 'saved=yes' : payload.saved === false ? 'saved=no' : null,
    typeof payload.error === 'string' ? `error=${payload.error}` : null,
  ].filter(Boolean);
  console.log(parts.join(' '));
}

async function connectBrowser(options: PublishOptions): Promise<{
  cdp: CdpConnection;
  launchedChrome: ChildProcess | null;
  connectedPort: number | null;
}> {
  let connectedPort = options.cdpPort ?? null;
  let cdp = connectedPort ? await tryConnectExisting(connectedPort) : null;
  if (!cdp) {
    const discoveredPort = await findExistingChromeDebugPort();
    if (discoveredPort) {
      cdp = await tryConnectExisting(discoveredPort);
      connectedPort = cdp ? discoveredPort : connectedPort;
    }
  }

  if (cdp) {
    return { cdp, launchedChrome: null, connectedPort };
  }

  const launched = await launchChrome(QIEHAO_HOME, options.profileDir);
  return {
    cdp: launched.cdp,
    launchedChrome: launched.chrome,
    connectedPort: launched.port,
  };
}

async function main(): Promise<void> {
  const rawOptions = parseArgs(process.argv.slice(2));
  const options = resolveDefaults(rawOptions, loadExtendConfig());
  const prepared = prepareInput(options);

  if (!options.probeOnly && prepared.sourceKind === 'none') {
    throw new Error('Provide --html, --markdown, or --content, or use --probe-only.');
  }

  let launchedChrome: ChildProcess | null = null;
  let cdp: CdpConnection | null = null;
  let lastProbe: ProbeSummary | null = null;
  let lastSave: DraftSaveSummary | null = null;

  try {
    const browser = await connectBrowser(options);
    launchedChrome = browser.launchedChrome;
    cdp = browser.cdp;

    const homeSession = await ensureQiehaoSession(cdp);
    const initialState = await getQiehaoPageState(homeSession);
    if (!isQiehaoSessionLoggedIn(initialState)) {
      console.error('[qiehao] Login required. Please log in through the open browser window.');
      await waitForLogin(homeSession);
    }

    const composeSession = await openFreshComposeSession(cdp, options.editorUrl!);
    const probe = await probeEditorAccess(composeSession);
    lastProbe = probe;
    const editorReachable = isEditorReachableUrl(probe.url) || probe.titleFieldPresent || probe.bodyExcerpt.includes(DRAFT_BUTTON_TEXT);
    const basePayload = {
      ok: true,
      mode: options.probeOnly ? 'probe' : 'draft-save',
      currentUrl: probe.url,
      pageTitle: probe.title,
      editorReachable,
      restrictionReason: probe.restrictionReason,
      titleFieldPresent: probe.titleFieldPresent,
      prepared,
      knownRoutes: {
        home: QIEHAO_HOME,
        editor: DEFAULT_EDITOR_URL,
        manage: DEFAULT_MANAGE_URL,
        save: ARTICLE_SAVE_PATH,
        publish: ARTICLE_PUBLISH_PATH,
        list: ARTICLE_LIST_PATH,
        info: ARTICLE_INFO_PATH,
      },
      reviewMarkers: QUALIFICATION_REVIEW_MARKERS,
      bodyExcerpt: probe.bodyExcerpt,
    };

    if (!editorReachable) {
      throw new Error(`Qiehao article editor was not reached. Current URL: ${probe.url}.`);
    }

    if (!probe.titleFieldPresent) {
      throw new Error('Qiehao article editor loaded but the title field was not detected.');
    }

    if (options.probeOnly) {
      renderOutput(basePayload, options.text);
      return;
    }

    if (!prepared.title) {
      throw new Error('Qiehao draft save requires a non-empty title.');
    }

    lastSave = await saveDraftInEditor(composeSession, prepared);
    if (!lastSave.ok) {
      throw new Error(lastSave.reason || 'Qiehao draft save did not confirm success.');
    }

    renderOutput({
      ...basePayload,
      saved: lastSave.saved,
      saveMarkerText: lastSave.saveMarkerText,
      draftDisabled: lastSave.draftDisabled,
      draftClass: lastSave.draftClass,
      wordCount: lastSave.wordCount,
      titleText: lastSave.titleText,
      bodyExcerpt: lastSave.bodyText.slice(0, 240),
    }, options.text);
  } catch (error) {
    const payload = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      currentUrl: lastProbe?.url ?? null,
      saved: lastSave?.saved ?? null,
      restrictionReason: lastProbe?.restrictionReason ?? null,
      titleFieldPresent: lastProbe?.titleFieldPresent ?? null,
      pageTitle: lastProbe?.title ?? null,
      bodyExcerpt: lastSave?.bodyText.slice(0, 240) ?? lastProbe?.bodyExcerpt ?? null,
      wordCount: lastSave?.wordCount ?? null,
      prepared,
      knownRoutes: {
        home: QIEHAO_HOME,
        editor: DEFAULT_EDITOR_URL,
        manage: DEFAULT_MANAGE_URL,
        save: ARTICLE_SAVE_PATH,
        publish: ARTICLE_PUBLISH_PATH,
        list: ARTICLE_LIST_PATH,
        info: ARTICLE_INFO_PATH,
      },
    };
    renderOutput(payload, options.text);
    process.exitCode = 1;
  } finally {
    cdp?.close();
    if (options.closeOnFailure && launchedChrome && process.exitCode && process.exitCode !== 0) {
      try {
        launchedChrome.kill('SIGTERM');
      } catch {}
    }
  }
}

await main();
