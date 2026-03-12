// Скрипт для генерації git-метаданих у .env
const { execSync } = require('child_process');
const fs = require('fs');

function get(cmd) {
  try { return execSync(cmd).toString().trim(); } catch { return ''; }
}

const commit = get('git rev-parse HEAD');
const branch = get('git rev-parse --abbrev-ref HEAD');
const date = new Date().toISOString();

const env = [
  `VITE_GIT_COMMIT=${commit}`,
  `VITE_GIT_BRANCH=${branch}`,
  `VITE_DEPLOY_TIME=${date}`,
];

fs.appendFileSync('.env', '\n' + env.join('\n') + '\n');
console.log('Git meta added to .env:', env);
