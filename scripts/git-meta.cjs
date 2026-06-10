// Скрипт для генерації git-метаданих у .env.local
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT_DIR, '.env.local');
const APP_BASE_VERSION = '1.0.3';
const BEGIN_MARKER = '# >>> LUCIA GIT META >>>';
const END_MARKER = '# <<< LUCIA GIT META <<<';

function get(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT_DIR, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const commit = get('git rev-parse HEAD');
const shortCommit = get('git rev-parse --short=8 HEAD');
const branch = get('git rev-parse --abbrev-ref HEAD');
const dirty = Boolean(get('git status --porcelain'));
const date = new Date().toISOString();
const version = `${APP_BASE_VERSION}+${shortCommit || 'local'}${dirty ? '.dirty' : ''}`;

const metaLines = [
  BEGIN_MARKER,
  `VITE_GIT_COMMIT=${commit}`,
  `VITE_GIT_COMMIT_SHORT=${shortCommit}`,
  `VITE_GIT_BRANCH=${branch}`,
  `VITE_DEPLOY_TIME=${date}`,
  `VITE_APP_VERSION=${version}`,
  `BACKEND_VERSION=${version}`,
  END_MARKER,
];

let existing = '';
try {
  existing = fs.readFileSync(ENV_FILE, 'utf8');
} catch {
  existing = '';
}

const blockPattern = new RegExp(
  `${escapeRegExp(BEGIN_MARKER)}[\\s\\S]*?${escapeRegExp(END_MARKER)}\\n?`,
  'm'
);

const nextContent = blockPattern.test(existing)
  ? existing.replace(blockPattern, `${metaLines.join('\n')}\n`)
  : `${existing.replace(/\s*$/, '')}${existing.trim() ? '\n\n' : ''}${metaLines.join('\n')}\n`;

fs.writeFileSync(ENV_FILE, nextContent);
console.log(`Git meta written to ${path.relative(ROOT_DIR, ENV_FILE)}:`, {
  version,
  branch,
  commit: shortCommit || commit || 'local',
  dirty,
});
