const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Segmenter } = require('../src/segmenter.js');
const { makeDocument, retrieve, buildPrompt } = require('../src/context.cjs');
const { CodexBridge } = require('../src/codex.cjs');

test('loopback segmenter ignores silence and preserves audio around a spoken phrase', () => {
  const outputs = [];
  const s = new Segmenter({ onSegment: x => outputs.push(x) });
  const silence = new Float32Array(1600), speech = new Float32Array(1600).fill(.08);
  for (let i = 0; i < 20; i++) s.push(silence);
  assert.equal(outputs.length, 0);
  for (let i = 0; i < 7; i++) s.push(speech);
  for (let i = 0; i < 9; i++) s.push(silence);
  assert.equal(outputs.length, 1);
  assert.ok(outputs[0].some(x => x > .07));
  assert.equal(s.active, false);
});
test('short spikes do not trigger transcription and long speech stays bounded', () => {
  const outputs = [];
  const s = new Segmenter({ maxSeconds: 2, onSegment: x => outputs.push(x) });
  s.push(new Float32Array(1600).fill(.1));
  for (let i = 0; i < 10; i++) s.push(new Float32Array(1600));
  assert.equal(outputs.length, 0);
  for (let i = 0; i < 45; i++) s.push(new Float32Array(1600).fill(.1));
  s.flush();
  assert.equal(outputs.length, 3);
  assert.ok(outputs.every(x => x.length <= 32000));
});
test('retrieval selects relevant backend evidence within its budget', () => {
  const docs = [makeDocument('resume.txt', 'I built payment APIs with PostgreSQL transactions and idempotency keys.'), makeDocument('other.txt', 'I enjoy photography and landscape composition.')];
  const context = retrieve(docs, 'How do PostgreSQL transactions protect payment idempotency?', 170);
  assert.match(context, /resume.txt/); assert.doesNotMatch(context, /other.txt/); assert.ok(context.length <= 170);
});
test('prompt preserves personal context and bounds conversation history', () => {
  const prompt = buildPrompt({ question: 'Explain indexes', settings: { role: 'Backend Engineer', language: 'English', background: 'Python developer' }, documents: [], history: Array.from({length: 10}, (_, i) => ({ question: `q${i}`, answer: `a${i}` })) });
  assert.match(prompt, /Python developer/); assert.match(prompt, /Never invent/); assert.doesNotMatch(prompt, /"q0"/); assert.match(prompt, /"q9"/);
});
test('Codex events stream only the active thread and propagate failed turns', async () => {
  const bridge = new CodexBridge('.'); let output = '', rejected;
  bridge.active = { threadId: 'ours', text: '', onDelta: delta => output += delta, reject: error => rejected = error, resolve: () => assert.fail('unexpected success') };
  bridge.handle({method:'item/agentMessage/delta',params:{threadId:'other',delta:'wrong'}});
  bridge.handle({method:'item/agentMessage/delta',params:{threadId:'ours',delta:'Correct'}});
  bridge.handle({method:'turn/completed',params:{threadId:'ours',turn:{status:'failed',error:{message:'Quota exceeded'}}}});
  assert.equal(output, 'Correct'); assert.equal(rejected.message, 'Quota exceeded'); assert.equal(bridge.active, null);
});
test('unexpected tool approval is declined', () => {
  const bridge = new CodexBridge('.'); let sent; bridge.send = message => sent = message;
  bridge.handle({id:45,method:'item/commandExecution/requestApproval',params:{command:'anything'}});
  assert.deepEqual(sent, {id:45,result:{decision:'decline'}});
});
