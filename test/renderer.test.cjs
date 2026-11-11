const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { Segmenter } = require('../src/segmenter.js');

function rendererHarness() {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value: '', checked: false, textContent: '', hidden: false, disabled: false, style: {}, children: [], classList: { add(){}, remove(){}, toggle(){} }, addEventListener(){}, setAttribute(){}, append(...items){this.children.push(...items);}, replaceChildren(...items){this.children = items;}, add(){}, focus(){} });
    return elements.get(id);
  };
  let resolveAnswer;
  const state = { calls: [], cancelled: 0 };
  const desk = {
    onEvent: fn => { state.event = fn; },
    init: () => new Promise(() => {}),
    settings: async input => input,
    answer: question => { state.calls.push(question); return new Promise(resolve => { resolveAnswer = resolve; }); },
    cancel: async () => { state.cancelled++; },
    clear: async () => true
  };
  const sandbox = {
    desk, Segmenter, console, Float32Array, Date, setTimeout, clearTimeout,
    document: { body: element('body'), getElementById: element, addEventListener(){}, querySelectorAll: () => [], createElement: () => element(Math.random()), createTextNode: text => ({textContent:text}), createComment: () => ({after(){}}) },
    navigator: { clipboard: { writeText: async () => {} } }
  };
  vm.createContext(sandbox); vm.runInContext(fs.readFileSync(require.resolve('../src/renderer.js'), 'utf8'), sandbox);
  return { element, state, run: source => vm.runInContext(source, sandbox), finish: () => resolveAnswer({ answer: 'Test answer', firstMs: 100, totalMs: 200 }) };
}

test('speech received during generation survives completion of the previous answer', async () => {
  const h = rendererHarness();
  h.element('question').value = 'First question';
  const pending = h.run('answer()');
  await new Promise(resolve => setImmediate(resolve));
  h.run('addTranscript("Next question", 120)');
  h.finish(); await pending;
  assert.equal(h.element('question').value, 'Next question');
  assert.equal(h.element('answerBody').textContent, 'Test answer');
  assert.equal(h.element('answer').disabled, false);
});
test('audio diagnostic does not enqueue transcription or send questions', () => {
  const h = rendererHarness();
  h.run('testOnly = true; enqueue(new Float32Array(1600));');
  assert.equal(h.run('audioQueue.length'), 0);
  assert.equal(h.state.calls.length, 0);
});
test('automatic mode waits for an unfinished spoken phrase', async () => {
  const h = rendererHarness(); h.element('auto').checked = true;
  h.run('capturing = true; segmenter = {active:true}; addTranscript("An incomplete question", 100);');
  await new Promise(resolve => setTimeout(resolve, 650));
  assert.equal(h.state.calls.length, 0);
  h.run('capturing = false; clearTimeout(autoTimer);');
});
