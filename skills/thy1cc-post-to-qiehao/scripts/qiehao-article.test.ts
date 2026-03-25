import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('help output includes html markdown content and probe flags', () => {
  const scriptPath = path.join(import.meta.dirname, 'qiehao-article.ts');
  const result = spawnSync('node', ['--experimental-strip-types', scriptPath, '--help'], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /--html/);
  assert.match(output, /--markdown/);
  assert.match(output, /--content/);
  assert.match(output, /--title/);
  assert.match(output, /--probe-only/);
});

test('source keeps qiehao editor routes and qualification-review guardrails', () => {
  const scriptPath = path.join(import.meta.dirname, 'qiehao-article.ts');
  const source = fs.readFileSync(scriptPath, 'utf8');

  assert.match(source, /https:\/\/om\.qq\.com\//);
  assert.match(source, /article\/articlePublish/);
  assert.match(source, /article\/articleManage/);
  assert.match(source, /\/article\/save/);
  assert.match(source, /\/article\/publish/);
  assert.match(source, /\/article\/list\?index=/);
  assert.match(source, /资质审核中/);
  assert.match(source, /主体资料正在审核中/);
  assert.match(source, /placeholder\*="标题"/);
});

test('source uses the live qiehao editor selectors and draft-save confirmation', () => {
  const scriptPath = path.join(import.meta.dirname, 'qiehao-article.ts');
  const source = fs.readFileSync(scriptPath, 'utf8');

  assert.match(source, /omui-articletitle__input1/);
  assert.match(source, /ProseMirror\.ExEditor-basic/);
  assert.match(source, /存草稿/);
  assert.match(source, /已保存/);
});
