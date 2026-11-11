import { parentPort, workerData } from 'node:worker_threads';
import { pipeline, env } from '@huggingface/transformers';
env.cacheDir = workerData.cacheDir;
env.allowLocalModels = false;
env.backends.onnx.logLevel = 'error';
let recognizer;
let modelId;
let chain = Promise.resolve();
parentPort.on('message', message => {
  chain = chain.then(async () => {
    try {
      if (!recognizer || modelId !== message.model) {
        if (recognizer) await recognizer.dispose();
        modelId = message.model;
        recognizer = await pipeline('automatic-speech-recognition', modelId, {
          dtype: 'q8', device: 'cpu',
          progress_callback: p => { if (p.status === 'progress') parentPort.postMessage({ type: 'progress', file: p.file, progress: Math.round(p.progress || 0) }); }
        });
      }
      if (message.type === 'warmup') { parentPort.postMessage({ id: message.id, result: { ready: true } }); return; }
      const started = performance.now();
      const output = await recognizer(new Float32Array(message.audio), { return_timestamps: false, chunk_length_s: 25, stride_length_s: 3 });
      parentPort.postMessage({ id: message.id, result: { text: output.text.trim(), ms: Math.round(performance.now() - started) } });
    } catch (e) { parentPort.postMessage({ id: message.id, error: e.message }); }
  });
});
