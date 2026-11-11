const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
let failed = false;
for (const dir of ['src', 'scripts', 'test']) {
  for (const name of fs.readdirSync(dir).filter(n => /\.(cjs|mjs|js)$/.test(n))) {
    const result = spawnSync(process.execPath, ['--check', path.join(dir, name)], { encoding: 'utf8' });
    if (result.status) { process.stderr.write(result.stderr); failed = true; }
  }
}
if (failed) process.exit(1);
console.log('Sintaxe JavaScript válida.');
