const { packager } = require('@electron/packager');
const path = require('node:path');
const fs = require('node:fs/promises');
(async () => {
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, 'release');
  if (path.dirname(output) !== root) throw new Error('Diretório de saída inválido.');
  const artifacts = await packager({
    dir: root, name: 'InterviewDesk', platform: 'win32', arch: 'x64', out: output,
    overwrite: true, prune: true, asar: false,
    ignore: [/^\/(release|test|docs|tmp|\.cache|\.git)(\/|$)/],
    win32metadata: { CompanyName: 'Interview Desk', FileDescription: 'Interview Desk', ProductName: 'Interview Desk' }
  });
  for (const artifact of artifacts) {
    await fs.copyFile(path.join(root, 'README.md'), path.join(artifact, 'LEIA-ME.md'));
    console.log(`Aplicativo criado em: ${artifact}`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
