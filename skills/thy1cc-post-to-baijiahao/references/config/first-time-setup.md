# First-Time Setup

Create one of these files:

- Project-level: `.thy1cc-skills/thy1cc-post-to-baijiahao/EXTEND.md`
- User-level: `$HOME/.thy1cc-skills/thy1cc-post-to-baijiahao/EXTEND.md`

Recommended template:

```md
default_author: 你的署名
default_action: draft
chrome_profile_path: $HOME/.local/share/baijiahao-browser-profile
editor_url:
create_button_texts: 发布内容,发文,写文章,图文
```

Notes:

- `default_action`: `draft` or `submit`. Keep `draft` as the default.
- `chrome_profile_path`: use a dedicated profile directory for Baijiahao automation.
- `editor_url`: optional direct editor URL if you already know a stable creator page in your account.
- `create_button_texts`: comma-separated button texts tried when no direct editor URL is configured.

Suggested local article root for this workflow:

```text
~/Documents/articles/baijiahao
```

That path is not required by the script, but it is a good default package root for article assets and publish-ready HTML.
