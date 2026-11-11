const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function findCodex() {
  if (process.env.CODEX_BINARY && fs.existsSync(process.env.CODEX_BINARY)) return process.env.CODEX_BINARY;
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const exe = path.join(dir, process.platform === 'win32' ? 'codex.exe' : 'codex');
    if (fs.existsSync(exe)) return exe;
  }
  const extensions = path.join(os.homedir(), '.vscode', 'extensions');
  if (fs.existsSync(extensions)) {
    for (const dir of fs.readdirSync(extensions).filter(n => n.startsWith('openai.chatgpt-')).sort().reverse()) {
      const exe = path.join(extensions, dir, 'bin', 'windows-x86_64', 'codex.exe');
      if (fs.existsSync(exe)) return exe;
    }
  }
  // The npm distribution places the real executable below its platform package.
  const roots = [path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@openai'), path.join(__dirname, '..', 'node_modules', '@openai')];
  for (const root of roots) {
    for (const rel of ['codex-win32-x64/vendor/x86_64-pc-windows-msvc/codex/codex.exe', 'codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/codex/codex.exe', 'codex/vendor/x86_64-pc-windows-msvc/codex/codex.exe']) {
      const exe = path.join(root, rel); if (fs.existsSync(exe)) return exe;
    }
  }
  throw new Error('Codex não encontrado. Instale a extensão OpenAI no VS Code ou defina CODEX_BINARY com o caminho de codex.exe.');
}

class CodexBridge extends EventEmitter {
  constructor(cwd) { super(); this.cwd = cwd; this.pending = new Map(); this.seq = 0; this.proc = null; this.starting = null; this.active = null; }
  async start() {
    if (this.starting) return this.starting;
    this.starting = this._start().catch(e => { this.starting = null; throw e; });
    return this.starting;
  }
  async _start() {
    const exe = findCodex();
    this.proc = spawn(exe, ['app-server', '--stdio', '-c', 'analytics.enabled=false'], { cwd: this.cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.proc.on('error', e => this.fail(new Error(`Falha ao iniciar Codex: ${e.message}`)));
    this.proc.on('exit', () => { this.proc = null; this.starting = null; this.fail(new Error('A conexão com Codex foi encerrada. Conecte novamente.')); });
    this.proc.stdin.on('error', () => {});
    this.proc.stderr.on('data', () => {}); // Don't expose auth or raw diagnostic logs to the renderer.
    createInterface({ input: this.proc.stdout }).on('line', line => {
      let msg; try { msg = JSON.parse(line); } catch { return; }
      this.handle(msg);
    });
    await this.rpc('initialize', { clientInfo: { name: 'interview_desk', title: 'Interview Desk', version: '1.0.0' }, capabilities: { experimentalApi: true } });
    this.send({ method: 'initialized', params: {} });
  }
  fail(error) {
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); }
    this.pending.clear();
    if (this.active) { this.active.reject(error); this.active = null; }
  }
  send(message) { if (!this.proc?.stdin.writable) throw new Error('Codex desconectado.'); this.proc.stdin.write(JSON.stringify(message) + '\n'); }
  rpc(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex demorou a responder (${method}).`)); }, 45000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ id, method, params }); } catch (e) { clearTimeout(timer); this.pending.delete(id); reject(e); }
    });
  }
  handle(msg) {
    if (msg.id !== undefined && !msg.method) {
      const p = this.pending.get(msg.id); if (!p) return;
      clearTimeout(p.timer); this.pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); return;
    }
    if (msg.id !== undefined && msg.method) {
      // This is a text-only assistant; never authorize tool execution from attachments.
      const result = msg.method.includes('requestApproval') ? { decision: 'decline' } : null;
      this.send(result ? { id: msg.id, result } : { id: msg.id, error: { code: -32601, message: 'Tools are not available in Interview Desk.' } });
      return;
    }
    const p = msg.params || {};
    if (msg.method === 'account/login/completed' || msg.method === 'account/updated') this.emit('account', p);
    const active = this.active;
    if (!active || p.threadId !== active.threadId) return;
    if (msg.method === 'turn/started') active.turnId = p.turn.id;
    if (msg.method === 'turn/started' && this.cancelRequested) this.cancel().catch(() => {});
    if (msg.method === 'item/agentMessage/delta') { active.text += p.delta; active.onDelta(p.delta); }
    if (msg.method === 'item/completed' && p.item?.type === 'agentMessage') {
      if (!active.text && p.item.text) { active.text = p.item.text; active.onDelta(p.item.text); }
    }
    if (msg.method === 'turn/completed') {
      this.active = null;
      if (p.turn.status === 'completed') active.resolve(active.text);
      else active.reject(new Error(p.turn.error?.message || (p.turn.status === 'interrupted' ? 'Resposta interrompida.' : 'Não foi possível gerar a resposta.')));
    }
  }
  async account() { await this.start(); return this.rpc('account/read', { refreshToken: false }); }
  async login() { await this.start(); return this.rpc('account/login/start', { type: 'chatgpt' }); }
  async models() { await this.start(); return this.rpc('model/list', {}); }
  async answer(prompt, images, model, effort, onDelta) {
    await this.start();
    if (this.active || this.answering) throw new Error('Já existe uma resposta em andamento.');
    this.answering = true;
    this.cancelRequested = false;
    let timer;
    try {
      const { thread } = await this.rpc('thread/start', {
        cwd: this.cwd, approvalPolicy: 'never', sandbox: 'read-only', ephemeral: true,
        ...(model ? { model } : {}),
        baseInstructions: 'You are a text-only interview assistant. Answer from the user-provided context. Never call any tools.',
        config: { 'features.shell_tool': false, 'web_search': 'disabled' }
      });
      if (this.cancelRequested) throw new Error('Resposta interrompida.');
      return await new Promise((resolve, reject) => {
        this.active = { threadId: thread.id, turnId: null, resolve, reject, text: '', onDelta };
        timer = setTimeout(() => { this.cancel().catch(() => {}); if (this.active?.threadId === thread.id) { this.active = null; reject(new Error('Tempo limite da resposta (120 s). Verifique a conexão e os limites da conta.')); } }, 120000);
        this.rpc('turn/start', { threadId: thread.id, input: [{ type: 'text', text: prompt }, ...images.map(p => ({ type: 'localImage', path: p }))], ...(effort ? { effort } : {}) })
          .then(result => { if (this.active?.threadId === thread.id) { this.active.turnId = result.turn.id; if (this.cancelRequested) this.cancel().catch(() => {}); } })
          .catch(e => { if (this.active?.threadId === thread.id) this.active = null; reject(e); });
      });
    } finally { clearTimeout(timer); this.answering = false; }
  }
  async cancel() { this.cancelRequested = true; if (this.active?.turnId) await this.rpc('turn/interrupt', { threadId: this.active.threadId, turnId: this.active.turnId }); }
  stop() { this.fail(new Error('Aplicativo encerrado.')); this.proc?.kill(); }
}
module.exports = { CodexBridge, findCodex };
