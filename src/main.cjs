const { app, BrowserWindow, ipcMain, dialog, desktopCapturer, session, shell, nativeImage, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { Worker } = require('node:worker_threads');
const { randomUUID } = require('node:crypto');
const { CodexBridge } = require('./codex.cjs');
const { makeDocument, buildPrompt } = require('./context.cjs');
const { attachCompactWindow } = require('./compact-window.cjs');

let win, bridge, dataDir, stateFile, worker, compactWindow;
let state = { settings: { role: 'Backend Engineer', language: 'English', job: '', background: '', instructions: '', model: '', effort: 'medium', whisper: 'onnx-community/whisper-base.en', silence: 850, threshold: 0.008, auto: false }, documents: [] };
let history = [], busy = false, cancelPending = false, sttSeq = 0, sttPending = new Map(), saveChain = Promise.resolve();
const send = (type, data) => { if (win && !win.isDestroyed()) win.webContents.send('desk:event', { type, ...data }); };
const save = () => {
  const serialized = JSON.stringify(state);
  saveChain = saveChain.catch(() => {}).then(async () => { await fs.writeFile(stateFile + '.tmp', serialized, 'utf8'); await fs.rename(stateFile + '.tmp', stateFile); });
  return saveChain;
};
const publicDocs = () => state.documents.map(d => ({ id: d.id, name: d.name, chars: d.text.length, images: d.images.length }));

function startWorker() {
  if (worker) return;
  worker = new Worker(path.join(__dirname, 'transcriber.mjs'), { workerData: { cacheDir: app.isPackaged ? path.join(dataDir, 'models') : path.join(__dirname, '..', '.cache', 'models') } });
  worker.on('message', msg => {
    if (msg.type === 'progress') { send('download', msg); return; }
    const request = sttPending.get(msg.id); if (!request) return;
    clearTimeout(request.timer); sttPending.delete(msg.id);
    msg.error ? request.reject(new Error(msg.error)) : request.resolve(msg.result);
  });
  worker.on('error', e => { send('notice', { message: `Transcrição: ${e.message}` }); failWorker(e); });
  worker.on('exit', code => { worker = null; failWorker(new Error(`Motor de transcrição encerrado (${code}). Prepare o áudio novamente.`)); });
}
function failWorker(error) { for (const p of sttPending.values()) { clearTimeout(p.timer); p.reject(error); } sttPending.clear(); }
function stt(type, audio) {
  if (sttPending.size >= 3) throw new Error('Transcrição sobrecarregada. Aguarde ou escolha o modelo Tiny.');
  startWorker();
  return new Promise((resolve, reject) => {
    const id = ++sttSeq;
    const timer = setTimeout(() => { sttPending.delete(id); reject(new Error('Transcrição excedeu o tempo limite. Verifique a internet no primeiro download.')); worker?.terminate(); }, type === 'warmup' ? 600000 : 180000);
    sttPending.set(id, { resolve, reject, timer });
    worker.postMessage({ id, type, model: state.settings.whisper, ...(audio ? { audio } : {}) });
  });
}

async function importFile(file) {
  const stat = await fs.stat(file);
  if (stat.size > 25 * 1024 * 1024) throw new Error('Limite de 25 MB por arquivo.');
  const name = path.basename(file), ext = path.extname(file).toLowerCase();
  let text = '', images = [];
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
    const image = nativeImage.createFromPath(file);
    if (image.isEmpty()) throw new Error('Imagem inválida ou formato não suportado.');
    const { width, height } = image.getSize();
    const resized = Math.max(width, height) > 1800 ? image.resize(width >= height ? { width: 1800 } : { height: 1800 }) : image;
    const dest = path.join(dataDir, 'attachments', randomUUID() + '.png');
    await fs.writeFile(dest, resized.toPNG()); images = [dest];
  } else if (ext === '.pdf') {
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(await fs.readFile(file)) });
    try {
      const result = await parser.getText(); text = result.text;
      const scanned = result.pages.filter(page => page.text.trim().length < 40).map(page => page.num);
      if (scanned.length) {
        const slots = 6 - state.documents.reduce((n, d) => n + d.images.length, 0);
        if (scanned.length > slots) throw new Error(`PDF contém ${scanned.length} páginas sem texto. Há espaço para ${slots} imagens; importe um PDF menor ou apenas as páginas relevantes.`);
        const screenshots = await parser.getScreenshot({ partial: scanned, desiredWidth: 1400, imageDataUrl: false });
        for (const page of screenshots.pages) {
          const dest = path.join(dataDir, 'attachments', randomUUID() + '.png');
          await fs.writeFile(dest, page.data); images.push(dest);
        }
        text += `\n[${name}: páginas ${scanned.join(', ')} fornecidas como imagens para leitura visual.]`;
      }
    } finally { await parser.destroy(); }
  } else if (ext === '.docx') {
    text = (await require('mammoth').extractRawText({ path: file })).value;
  } else if (['.txt', '.md', '.csv', '.json'].includes(ext)) text = await fs.readFile(file, 'utf8');
  else throw new Error('Formato não suportado. Use PDF, DOCX, TXT, MD, CSV, JSON ou imagens PNG/JPG/WebP.');
  if (text.length > 600000) throw new Error('Arquivo muito extenso: limite de 600 mil caracteres. Separe os capítulos relevantes.');
  if (!text.trim() && !images.length) throw new Error('Arquivo sem conteúdo extraível.');
  return makeDocument(name, text, images);
}

function register() {
  const handle = (channel, fn) => ipcMain.handle(channel, async (event, ...args) => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Origem não autorizada.');
    try { return { ok: true, data: await fn(...args) }; } catch (e) { return { ok: false, error: e.message }; }
  });
  handle('desk:init', async () => ({ settings: state.settings, documents: publicDocs(), version: app.getVersion(), compact: compactWindow.isCompact() }));
  handle('desk:compact', value => compactWindow.setCompact(value === true));
  handle('desk:settings', async input => {
    for (const k of ['role', 'language', 'job', 'background', 'instructions', 'model']) if (typeof input[k] === 'string') state.settings[k] = input[k].slice(0, 18000);
    if (['low', 'medium', 'high'].includes(input.effort)) state.settings.effort = input.effort;
    if (['onnx-community/whisper-tiny.en', 'onnx-community/whisper-base.en', 'onnx-community/whisper-small.en'].includes(input.whisper)) state.settings.whisper = input.whisper;
    if (Number.isFinite(input.silence)) state.settings.silence = Math.max(400, Math.min(2000, input.silence));
    if (Number.isFinite(input.threshold)) state.settings.threshold = Math.max(0.001, Math.min(0.1, input.threshold));
    if (typeof input.auto === 'boolean') state.settings.auto = input.auto;
    await save(); return state.settings;
  });
  handle('desk:account', async () => {
    const result = await bridge.account();
    return { connected: !!result.account, type: result.account?.type, plan: result.account?.planType || null };
  });
  handle('desk:login', async () => {
    const login = await bridge.login();
    const url = new URL(login.authUrl);
    if (url.protocol !== 'https:' || !['auth.openai.com', 'chatgpt.com', 'auth.chatgpt.com'].includes(url.hostname)) throw new Error('URL de autenticação inesperada.');
    await shell.openExternal(login.authUrl); return true;
  });
  handle('desk:models', async () => (await bridge.models()).data.map(m => ({ id: m.id, model: m.model, name: m.displayName, isDefault: m.isDefault, efforts: m.supportedReasoningEfforts })));
  handle('desk:import', async () => {
    const selection = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Contexto', extensions: ['pdf', 'docx', 'txt', 'md', 'csv', 'json', 'png', 'jpg', 'jpeg', 'webp'] }] });
    const errors = [];
    for (const file of selection.filePaths) {
      try {
        if (state.documents.length >= 30) throw new Error('Limite de 30 arquivos. Remova algum antes de adicionar outro.');
        const imageCount = state.documents.reduce((n, d) => n + d.images.length, 0);
        if (imageCount >= 6 && /\.(png|jpe?g|webp)$/i.test(file)) throw new Error('Limite de 6 imagens por contexto para controlar a latência.');
        state.documents.push(await importFile(file));
      } catch (e) { errors.push(`${path.basename(file)}: ${e.message}`); }
    }
    await save(); return { documents: publicDocs(), errors };
  });
  handle('desk:remove', async id => {
    const doc = state.documents.find(d => d.id === id);
    if (!doc) return publicDocs();
    if (busy) throw new Error('Aguarde a resposta terminar antes de remover o material.');
    for (const image of doc.images) {
      if (path.dirname(path.resolve(image)) === path.resolve(dataDir, 'attachments')) await fs.unlink(image).catch(() => {});
    }
    state.documents = state.documents.filter(d => d.id !== id); history = []; await save(); return publicDocs();
  });
  handle('desk:warmup', () => stt('warmup'));
  handle('desk:transcribe', audio => {
    const samples = audio instanceof Float32Array ? audio : new Float32Array(audio);
    if (!samples.length || samples.length > 16000 * 30 || samples.some(x => !Number.isFinite(x))) throw new Error('Bloco de áudio inválido.');
    return stt('audio', samples);
  });
  handle('desk:answer', async question => {
    if (typeof question !== 'string' || !question.trim() || question.length > 20000) throw new Error('Digite ou capture uma pergunta de até 20 mil caracteres.');
    if (busy) throw new Error('Aguarde a resposta atual ou interrompa.');
    busy = true; cancelPending = false;
    const started = Date.now(); let first = null;
    try {
      const account = await bridge.account();
      if (cancelPending) throw new Error('Resposta interrompida.');
      if (account.account?.type !== 'chatgpt') throw new Error('Conecte sua assinatura usando “Continuar com ChatGPT”.');
      const images = state.documents.flatMap(d => d.images);
      const answer = await bridge.answer(buildPrompt({ question, settings: state.settings, documents: state.documents, history }), images, state.settings.model, state.settings.effort, delta => {
        if (first === null) first = Date.now() - started;
        send('answer-delta', { delta, firstMs: first });
      });
      history.push({ question, answer }); history = history.slice(-6);
      return { answer, firstMs: first, totalMs: Date.now() - started };
    } finally { busy = false; }
  });
  handle('desk:cancel', () => { cancelPending = true; return bridge.cancel(); });
  handle('desk:clear', () => { if (busy) throw new Error('Interrompa a resposta antes de limpar.'); history = []; return true; });
  handle('desk:pin', value => { win.setAlwaysOnTop(!!value); return !!value; });
  handle('desk:export', async content => {
    if (typeof content !== 'string' || content.length > 2000000) throw new Error('Conteúdo inválido.');
    const result = await dialog.showSaveDialog(win, { defaultPath: `entrevista-${new Date().toISOString().slice(0, 10)}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }] });
    if (result.filePath) await fs.writeFile(result.filePath, content, 'utf8'); return !result.canceled;
  });
}

app.whenReady().then(async () => {
  dataDir = app.getPath('userData'); stateFile = path.join(dataDir, 'context.json');
  await fs.mkdir(path.join(dataDir, 'attachments'), { recursive: true });
  await fs.mkdir(path.join(dataDir, 'session'), { recursive: true });
  try {
    const stored = JSON.parse(await fs.readFile(stateFile, 'utf8'));
    if (stored.settings && Array.isArray(stored.documents)) state = { settings: { ...state.settings, ...stored.settings }, documents: stored.documents };
  } catch (e) { if (e.code !== 'ENOENT') console.error('Contexto anterior inválido; usando configuração inicial.'); }
  bridge = new CodexBridge(path.join(dataDir, 'session'));
  bridge.on('account', info => send('account-change', { success: info.success, error: info.error }));
  win = new BrowserWindow({ width: 1360, height: 900, minWidth: 1000, minHeight: 700, title: 'Interview Desk', backgroundColor: '#101317', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  compactWindow = attachCompactWindow(win, screen, compact => send('view-mode', { compact }));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => callback(contents === win.webContents && ['media', 'display-capture'].includes(permission)));
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      if (request.frame !== win.webContents.mainFrame) return callback({});
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
      if (!sources.length) return callback({});
      callback({ video: sources[0], audio: 'loopback' });
    } catch { callback({}); }
  });
  register();
  await win.loadFile(path.join(__dirname, 'index.html'));
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { bridge?.stop(); worker?.terminate(); });
