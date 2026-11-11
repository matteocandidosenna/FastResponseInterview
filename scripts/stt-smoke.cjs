const { Worker } = require('node:worker_threads');
const path = require('node:path');
const fs = require('node:fs');
const worker = new Worker(path.resolve(__dirname, '../src/transcriber.mjs'), { workerData: { cacheDir: path.resolve(__dirname, '../.cache/models') } });
const timer = setTimeout(() => { console.error('STT smoke timed out'); worker.terminate(); process.exitCode = 1; }, 600000);
const downloaded = new Set();
worker.on('message', message => {
  if (message.type === 'progress') { if (message.progress === 100 && !downloaded.has(message.file)) { downloaded.add(message.file); console.log('Downloaded:', message.file); } return; }
  if (message.error) { console.error(message.error); clearTimeout(timer); worker.terminate(); process.exitCode = 1; return; }
  if (message.id === 1) {
    console.log('Whisper ready');
    const file = path.resolve(__dirname, '../tmp/speech.f32');
    if (!fs.existsSync(file)) { clearTimeout(timer); worker.terminate(); return; }
    const buffer = fs.readFileSync(file); const samples = new Float32Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
    worker.postMessage({ id: 2, type: 'audio', model: 'onnx-community/whisper-base.en', audio: samples });
  } else {
    console.log(JSON.stringify(message.result));
    fs.writeFileSync(path.resolve(__dirname, '../tmp/stt-result.json'), JSON.stringify(message.result, null, 2));
    if (!/database|transaction|payment|concurrent/i.test(message.result.text)) process.exitCode = 1;
    clearTimeout(timer); worker.terminate();
  }
});
worker.on('error', error => { console.error(error); clearTimeout(timer); process.exitCode = 1; });
worker.postMessage({ id: 1, type: 'warmup', model: 'onnx-community/whisper-base.en' });
