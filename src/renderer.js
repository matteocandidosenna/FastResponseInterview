const $ = id => document.getElementById(id);
let settings, ready = false, capturing = false, captureStarting = false, stream, audioContext, source, processor, silentGain, segmenter;
let audioQueue = [], draining = false, generating = false, currentAnswer = '', transcripts = [], answers = [], pinned = false;
let autoTimer, settingsTimer, audioEpoch = 0, newestAutoQuestion = '', questionVersion = 0;
let testOnly = false, testPeak = 0;
const fields = ['role', 'language', 'job', 'background', 'instructions', 'model', 'effort', 'whisper', 'silence', 'threshold', 'auto'];
const practice = {
  api: ['How would you design an idempotent payment API? Discuss retries and concurrent requests.', 'How do you version a REST API without breaking existing clients?', 'How would you design rate limiting for a multi-tenant API?'],
  data: ['A database query became slow as the table grew. How would you diagnose and fix it?', 'Explain transaction isolation levels and when you would use each.', 'How do you keep a cache consistent with a relational database?'],
  system: ['Design a reliable job processing system. How do you handle duplicates, retries and poison messages?', 'Design a URL shortener and explain your storage and scaling choices.', 'How would you investigate intermittent latency in a backend service?'],
  behavior: ['Tell me about yourself and your backend engineering experience.', 'Describe a production incident you handled and what you learned.', 'Tell me about a technical trade-off you made with your team.']
};
const practiceIndex = {};
const controlHomes = new Map();
function setCompactView(compact) {
  document.body.classList.toggle('compact-mode', compact);
  $('compactHeader').hidden = !compact; $('compactControls').hidden = !compact;
  for (const id of ['warmup', 'capture', 'answer', 'cancel', 'audioStatus']) {
    const control = $(id);
    if (compact) {
      if (!controlHomes.has(id)) {
        const marker = document.createComment(id);
        control.before(marker); controlHomes.set(id, marker);
      }
      $('compactControls').append(control);
    } else if (controlHomes.has(id)) controlHomes.get(id).after(control);
  }
  updateCompactReady();
}
function updateCompactReady() { document.body.classList.toggle('transcription-ready', ready); }

function notice(message, error = false) { $('notice').hidden = !message; $('notice').textContent = message; $('notice').classList.toggle('error', error); }
function handleError(error) { notice(error.message || String(error), true); }
function readSettings() {
  return Object.fromEntries(fields.map(id => [id, id === 'auto' ? $(id).checked : ['silence', 'threshold'].includes(id) ? Number($(id).value) : $(id).value]));
}
async function saveSettings() { clearTimeout(settingsTimer); settings = await desk.settings(readSettings()); $('saved').textContent = 'Salvo localmente'; updateLabels(); }
function updateLabels() { $('roleTag').textContent = `${settings.role} / ${settings.language}`.toUpperCase(); $('languageBadge').textContent = settings.language === 'English' ? 'EN' : 'PT'; }
async function refreshAccount() {
  try {
    const account = await desk.account();
    const connected = account.connected && account.type === 'chatgpt';
    $('accountDot').classList.toggle('connected', connected);
    $('accountStatus').textContent = connected ? `ChatGPT conectado${account.plan ? ' · ' + account.plan : ''}` : 'Conecte sua assinatura';
    $('login').textContent = connected ? 'Reconectar ChatGPT' : 'Continuar com ChatGPT';
    if (connected) {
      const models = await desk.models();
      $('model').replaceChildren(new Option('Padrão da sua conta', ''));
      for (const m of models) $('model').add(new Option(m.name || m.model, m.model));
      $('model').value = settings.model;
    }
  } catch (e) { $('accountStatus').textContent = 'Codex indisponível'; handleError(e); }
}
function renderFiles(files) {
  $('fileCount').textContent = `${files.length} arquivo${files.length === 1 ? '' : 's'}`;
  $('files').replaceChildren();
  for (const file of files) {
    const row = document.createElement('div'); row.className = 'file';
    const content = document.createElement('div'), title = document.createElement('strong'), meta = document.createElement('small'), remove = document.createElement('button');
    title.textContent = file.name; title.title = file.name;
    meta.textContent = file.images ? `${file.images} imagem · visão do modelo` : `${file.chars.toLocaleString('pt-BR')} caracteres indexados`;
    remove.textContent = '×'; remove.title = `Remover ${file.name}`; remove.setAttribute('aria-label', remove.title);
    remove.onclick = async () => { try { renderFiles(await desk.remove(file.id)); } catch (e) { handleError(e); } };
    content.append(title, meta); row.append(content, remove); $('files').append(row);
  }
}
function addTranscript(text, ms) {
  if (!text.trim()) return;
  const last = transcripts.at(-1);
  if (last && last.text === text && Date.now() - last.at < 4000) return;
  const entry = { text, at: Date.now() }; transcripts.push(entry);
  if (transcripts.length === 1) $('transcript').replaceChildren();
  const row = document.createElement('p'), time = document.createElement('time'); row.className = 'transcript-entry';
  time.textContent = new Date(entry.at).toLocaleTimeString('pt-BR'); row.append(time, document.createTextNode(text)); $('transcript').append(row); $('transcript').scrollTop = $('transcript').scrollHeight;
  $('sttTime').textContent = `STT ${(ms / 1000).toFixed(1)} s`;
  $('question').value = `${$('question').value.trim()} ${text}`.trim(); questionVersion++;
  if ($('auto').checked) scheduleAuto();
}
function scheduleAuto() {
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => {
    if (!capturing || !$('auto').checked || testOnly) return;
    if (segmenter?.active || audioQueue.length || draining) { scheduleAuto(); return; }
    newestAutoQuestion = $('question').value.trim();
    if (!generating && newestAutoQuestion) answer(newestAutoQuestion);
  }, 550);
}
async function drainAudio() {
  if (draining) return;
  draining = true;
  try {
    while (audioQueue.length) {
      const { samples, epoch } = audioQueue.shift();
      try {
        $('audioStatus').textContent = 'Transcrevendo…';
        const result = await desk.transcribe(samples);
        if (epoch === audioEpoch) addTranscript(result.text, result.ms);
      } catch (e) { if (epoch === audioEpoch) handleError(e); }
    }
  } finally { draining = false; $('audioStatus').textContent = capturing ? 'Ouvindo o sistema' : 'Captura desligada'; }
}
function enqueue(samples) {
  if (testOnly) return;
  if (audioQueue.length >= 3) {
    notice('A transcrição não acompanhou o áudio. A captura foi pausada para evitar perda silenciosa. Aguarde a fila terminar e use Tiny para mais velocidade.', true);
    stopCapture(false); return;
  }
  audioQueue.push({ samples, epoch: audioEpoch }); drainAudio();
}
async function stopCapture(flush = true) {
  capturing = false; clearTimeout(autoTimer); newestAutoQuestion = '';
  if (segmenter) { if (flush) segmenter.flush(); else segmenter.reset(); }
  stream?.getTracks().forEach(t => t.stop()); stream = null;
  processor?.disconnect(); source?.disconnect(); silentGain?.disconnect();
  await audioContext?.close().catch(() => {}); audioContext = null;
  $('capture').textContent = '◉ Iniciar captura'; $('capture').classList.remove('recording'); $('capture').disabled = !ready;
  $('audioStatus').textContent = 'Captura desligada'; $('sessionBadge').textContent = '● Captura pausada'; $('meterFill').style.width = '0%'; $('db').textContent = '— dB';
}
async function startCapture(diagnostic = false) {
  if (captureStarting || capturing) return;
  testOnly = diagnostic; testPeak = 0;
  captureStarting = true; $('capture').disabled = true;
  try {
    notice(''); await saveSettings();
    // getDisplayMedia needs a video track. No video frames are processed, saved or sent.
    stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: { width: 1, height: 1, frameRate: 1 } });
    if (!stream.getAudioTracks().length) throw new Error('O Windows não disponibilizou áudio de sistema. Verifique a saída padrão e reinicie a captura.');
    stream.getVideoTracks().forEach(t => { t.enabled = false; });
    audioContext = new AudioContext({ sampleRate: 16000 });
    if (audioContext.sampleRate !== 16000) throw new Error('O dispositivo não aceitou 16 kHz. Reinicie o aplicativo com outra saída de áudio.');
    await audioContext.audioWorklet.addModule('audio-worker.js');
    segmenter = new Segmenter({ threshold: settings.threshold, silenceMs: settings.silence, onSegment: enqueue, onLevel: rms => {
      testPeak = Math.max(testPeak, rms);
      $('meterFill').style.width = `${Math.min(100, rms * 600)}%`;
      $('db').textContent = rms > 0.00001 ? `${Math.round(20 * Math.log10(rms))} dB` : '— dB';
    } });
    source = audioContext.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
    processor = new AudioWorkletNode(audioContext, 'pcm-collector');
    processor.port.onmessage = event => { if (capturing) segmenter.push(event.data); };
    silentGain = audioContext.createGain(); silentGain.gain.value = 0;
    source.connect(processor); processor.connect(silentGain); silentGain.connect(audioContext.destination);
    await audioContext.resume(); capturing = true;
    for (const track of stream.getTracks()) track.onended = () => { if (capturing) { notice('A fonte de áudio foi encerrada. Verifique o dispositivo e inicie novamente.', true); stopCapture(); } };
    $('capture').textContent = '■ Parar captura'; $('capture').classList.add('recording'); $('capture').disabled = false;
    $('audioStatus').textContent = 'Ouvindo o sistema'; $('sessionBadge').textContent = '● Captura ativa';
  } catch (e) { await stopCapture(false); handleError(e); } finally { captureStarting = false; }
}
async function answer(question = $('question').value.trim()) {
  if (generating) return;
  if (!question) { notice('Capture uma fala ou escreva uma pergunta.'); return; }
  const version = questionVersion;
  clearTimeout(autoTimer); newestAutoQuestion = ''; generating = true; currentAnswer = '';
  $('answer').disabled = true; $('cancel').hidden = false; $('answerBody').textContent = ''; $('answerBody').classList.add('loading');
  $('answerState').textContent = 'Preparando resposta…'; $('latency').textContent = 'Medindo primeiro texto…'; notice('');
  try {
    await saveSettings();
    const result = await desk.answer(question);
    currentAnswer = result.answer; $('answerBody').textContent = currentAnswer;
    $('answerState').textContent = `Concluída · ${(result.totalMs / 1000).toFixed(1)} s`;
    $('latency').textContent = `Primeiro texto ${result.firstMs == null ? '—' : (result.firstMs / 1000).toFixed(1) + ' s'}`;
    answers.push({ question, answer: result.answer, at: Date.now() });
    // Keep any new speech that arrived while the model was answering.
    if (questionVersion === version && $('question').value.trim() === question) $('question').value = '';
    else if ($('question').value.startsWith(question)) $('question').value = $('question').value.slice(question.length).trim();
  } catch (e) { $('answerState').textContent = 'Resposta não concluída'; handleError(e); newestAutoQuestion = ''; }
  finally {
    generating = false; $('answer').disabled = false; $('cancel').hidden = true; $('answerBody').classList.remove('loading');
    if (newestAutoQuestion && $('auto').checked && capturing) { newestAutoQuestion = ''; scheduleAuto(); }
  }
}

desk.onEvent(event => {
  if (event.type === 'view-mode') setCompactView(event.compact);
  if (event.type === 'answer-delta') { currentAnswer += event.delta; $('answerBody').textContent = currentAnswer; $('answerState').textContent = 'Respondendo…'; $('latency').textContent = `Primeiro texto ${(event.firstMs / 1000).toFixed(1)} s`; }
  if (event.type === 'download') $('download').textContent = `Baixando ${event.file || 'modelo'} · ${event.progress}%`;
  if (event.type === 'notice') notice(event.message, true);
  if (event.type === 'account-change') { if (event.error) notice(event.error, true); else if (event.success) notice('ChatGPT conectado. Você pode gerar respostas.'); refreshAccount(); }
});

$('login').onclick = async () => { try { await desk.login(); notice('Conclua o login no navegador. O aplicativo reconhecerá a conexão automaticamente.'); } catch (e) { handleError(e); } };
$('compact').onclick = async () => { try { await desk.compact(true); } catch (e) { handleError(e); } };
$('expand').onclick = async () => { try { await desk.compact(false); } catch (e) { handleError(e); } };
$('warmup').onclick = async () => {
  if (capturing) { notice('Pare a captura antes de preparar o modelo.'); return; }
  $('warmup').disabled = true; $('whisper').disabled = true; $('warmup').textContent = 'Preparando…'; ready = false; $('capture').disabled = true; notice('');
  try { await saveSettings(); await desk.warmup(); ready = true; $('capture').disabled = false; $('download').textContent = 'Modelo pronto neste computador.'; $('warmup').textContent = '✓ Transcrição preparada'; $('sessionBadge').textContent = '● Pronto para ouvir'; }
  catch (e) { handleError(e); $('warmup').textContent = 'Tentar preparar novamente'; }
  finally { $('warmup').disabled = false; $('whisper').disabled = false; updateCompactReady(); }
};
$('capture').onclick = () => capturing ? stopCapture() : startCapture();
$('testAudio').onclick = async () => {
  if (capturing || captureStarting) { notice('Pare a captura antes de testar o som.'); return; }
  $('testAudio').disabled = true; $('testAudio').textContent = 'Ouvindo por 5 segundos…';
  try {
    await startCapture(true);
    if (!capturing) return;
    await new Promise(resolve => setTimeout(resolve, 5000));
    const peak = testPeak;
    await stopCapture(false);
    notice(peak >= 0.001 ? `Áudio de sistema detectado. Pico: ${Math.round(20 * Math.log10(peak))} dB. Prepare a transcrição e inicie a captura.` : 'Nenhum som detectado. Reproduza um vídeo, confirme a saída padrão do Windows e tente novamente. Se trocou de fone, reinicie a captura.', peak < 0.001);
  } catch (e) { handleError(e); }
  finally { $('testAudio').disabled = false; $('testAudio').textContent = 'Testar som por 5 segundos'; testOnly = false; }
};
$('answer').onclick = () => answer();
$('cancel').onclick = async () => { try { newestAutoQuestion = ''; clearTimeout(autoTimer); await desk.cancel(); } catch (e) { handleError(e); } };
$('question').oninput = () => { questionVersion++; clearTimeout(autoTimer); };
document.addEventListener('keydown', event => { if (event.ctrlKey && event.key === 'Enter') { event.preventDefault(); answer(); } });
$('import').onclick = async () => { $('import').disabled = true; try { const result = await desk.importFiles(); renderFiles(result.documents); if (result.errors.length) notice(result.errors.join('\n'), true); else notice(''); } catch (e) { handleError(e); } finally { $('import').disabled = false; } };
$('copy').onclick = async () => { try { if (currentAnswer) { await navigator.clipboard.writeText(currentAnswer); $('copy').textContent = 'Copiado'; setTimeout(() => $('copy').textContent = 'Copiar', 1800); } } catch (e) { handleError(e); } };
$('pin').onclick = async () => { pinned = await desk.pin(!pinned); $('pin').setAttribute('aria-pressed', pinned); $('pin').textContent = pinned ? '◆ Janela fixada' : '◇ Fixar janela'; };
$('clear').onclick = async () => {
  try {
    await desk.clear(); audioEpoch++; audioQueue = []; segmenter?.reset(); transcripts = []; answers = []; currentAnswer = ''; clearTimeout(autoTimer); newestAutoQuestion = '';
    $('transcript').textContent = 'Sessão limpa. Aguardando fala.'; $('question').value = ''; $('answerBody').textContent = ''; $('answerState').textContent = 'Aguardando pergunta'; $('latency').textContent = 'Primeiro texto —'; $('sttTime').textContent = '—'; notice('');
  } catch (e) { handleError(e); }
};
$('export').onclick = async () => {
  const content = `# Interview Desk — ${new Date().toLocaleString('pt-BR')}\n\n## Transcrição\n\n${transcripts.map(t => t.text).join('\n\n')}\n\n## Perguntas e respostas\n\n${answers.map(a => `### ${a.question}\n\n${a.answer}`).join('\n\n')}`;
  try { if (await desk.export(content)) notice('Sessão exportada.'); } catch (e) { handleError(e); }
};
document.querySelectorAll('[data-practice]').forEach(button => button.onclick = () => {
  const category = button.dataset.practice, index = practiceIndex[category] || 0;
  $('question').value = practice[category][index % practice[category].length]; practiceIndex[category] = index + 1; questionVersion++; $('question').focus();
});
fields.forEach(id => $(id).addEventListener('input', () => {
  $('saved').textContent = 'Salvando…'; clearTimeout(settingsTimer); settingsTimer = setTimeout(() => saveSettings().catch(handleError), 400);
  if (id === 'whisper') { ready = false; updateCompactReady(); $('capture').disabled = true; if (capturing) stopCapture(); $('warmup').textContent = '↓ Preparar novo modelo'; }
  if (id === 'auto' && !$('auto').checked) { clearTimeout(autoTimer); newestAutoQuestion = ''; }
  if (segmenter && id === 'silence') segmenter.silenceMs = Number($('silence').value);
  if (segmenter && id === 'threshold') segmenter.threshold = Number($('threshold').value);
}));
(async () => {
  try {
    const initial = await desk.init(); settings = initial.settings;
    setCompactView(initial.compact);
    if (settings.model) $('model').add(new Option(settings.model, settings.model));
    $('model').value = settings.model;
    for (const id of fields) { if (id === 'auto') $(id).checked = settings[id]; else if (id !== 'model') $(id).value = settings[id]; }
    updateLabels(); renderFiles(initial.documents); await refreshAccount();
  } catch (e) { handleError(e); }
})();
