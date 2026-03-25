---
name: thy1cc-post-to-qiehao
description: Use when a user wants browser-led Qiehao article access or upload preparation through a real Chrome login session, especially to verify login state, qualification gating, and editor reachability before draft automation.
---

# Post to Qiehao

## Overview

This skill follows the same real-Chrome/CDP lane as the existing Baijiahao, Toutiao Hao, and Netease Hao skills.

Current live verification covers:

- reuse a logged-in Chrome session when possible
- confirm Qiehao login state
- detect `资质审核中` and other qualification markers
- reach the live editor route (currently resolves to `https://om.qq.com/main/creation/article`)
- fill title and body into the real editor
- click `存草稿` and verify the page-side `已保存` signal

Current boundary:

- this skill is draft-first; final publish is still intentionally out of scope
- body HTML injection is live-verified for text paragraphs, but cover upload, category selection, and complex image handling are not yet fully verified

## Script Directory

Determine this directory as `SKILL_DIR`, then use:

- `scripts/qiehao-article.ts`

## Preferences (EXTEND.md)

Check these locations in order:

```bash
test -f .thy1cc-skills/thy1cc-post-to-qiehao/EXTEND.md && echo "project"
test -f "$HOME/.thy1cc-skills/thy1cc-post-to-qiehao/EXTEND.md" && echo "user"
```

If neither exists, create one from [references/config/first-time-setup.md](references/config/first-time-setup.md).

Supported keys:

- `chrome_profile_path`
- `editor_url`

## Commands

Probe the current account first:

```bash
node --experimental-strip-types ${SKILL_DIR}/scripts/qiehao-article.ts \
  --probe-only
```

Reuse an existing logged-in Chrome debug port:

```bash
node --experimental-strip-types ${SKILL_DIR}/scripts/qiehao-article.ts \
  --probe-only --cdp-port 52534
```

Save one article draft from HTML:

```bash
node --experimental-strip-types ${SKILL_DIR}/scripts/qiehao-article.ts \
  --html article-publish.html \
  --title "标题"
```

Markdown package with companion HTML:

```bash
node --experimental-strip-types ${SKILL_DIR}/scripts/qiehao-article.ts \
  --markdown article-publish.md
```

Plain text fallback:

```bash
node --experimental-strip-types ${SKILL_DIR}/scripts/qiehao-article.ts \
  --content "正文" \
  --title "标题"
```

Observed live result from the current account:

- page URL resolved to `https://om.qq.com/main/creation/article`
- the page still showed `资质审核中`
- the draft-save action returned `已保存`

## Known Routes

- `https://om.qq.com/`
- `https://om.qq.com/article/articlePublish`
- `https://om.qq.com/article/articleManage`
- `https://om.qq.com/main/creation/article`
- `/article/save`
- `/article/publish`
- `/article/list?index=`
- `/article/info`

## Safety Rules

- Default to `--probe-only` when account state is uncertain
- Treat `资质审核中` as a warning signal, not automatic proof of failure; trust the real editor + `已保存` result instead
- Do not report upload success from unrelated redirected pages
- Keep JSON output as the default audit format

## Notes

- If the platform keeps redirecting away from `article/articlePublish`, that is usually an account-capability issue, not a route typo.
- Current live selectors use `omui-articletitle__input1`, `.ProseMirror.ExEditor-basic`, and the `存草稿` button.
- The current account can save drafts even while the page also displays `资质审核中`.
