const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
app.setPath('userData', path.join(root, 'tmp', 'smoke-profile'));
app.once('will-quit', () => app.exit(process.exitCode || 0));
app.on('browser-window-created', (_event, window) => {
  window.webContents.once('did-finish-load', async () => {
    const results = {};
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      results.interface = await window.webContents.executeJavaScript(`({title: document.title, fields: document.querySelectorAll('textarea').length, overflow: document.documentElement.scrollWidth > innerWidth})`);
      results.audio = await window.webContents.executeJavaScript(`(async () => {
        ready = true;
        await startCapture(true);
        if (!capturing) return {capturing:false, error:document.getElementById('notice').textContent};
        const toneContext = new AudioContext();
        await toneContext.resume();
        const oscillator = toneContext.createOscillator(); const gain = toneContext.createGain();
        oscillator.frequency.value = 440; gain.gain.value = .03;
        oscillator.connect(gain); gain.connect(toneContext.destination); oscillator.start();
        await new Promise(r => setTimeout(r, 1600));
        const result = {capturing, sampleRate:audioContext.sampleRate, tracks:stream.getAudioTracks().length, level:document.getElementById('db').textContent};
        oscillator.stop(); await toneContext.close();
        return result;
      })()`, true);
      const fullBounds = window.getNormalBounds();
      await window.webContents.executeJavaScript(`$('question').value = 'Pending question'; currentAnswer = 'Resposta preservada'; $('answerBody').textContent = currentAnswer;`);
      window.minimize();
      await new Promise(resolve => setTimeout(resolve, 700));
      results.compact = await window.webContents.executeJavaScript(`({compact: document.body.classList.contains('compact-mode'), capturing, question: $('question').value, answer: $('answerBody').textContent, controls: ['capture','answer','cancel'].every(id => $(id).parentElement === $('compactControls')), overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight})`);
      assert.equal(results.compact.compact, true); assert.equal(results.compact.capturing, true);
      assert.equal(results.compact.question, 'Pending question'); assert.equal(results.compact.answer, 'Resposta preservada');
      assert.equal(results.compact.controls, true); assert.equal(results.compact.overflow, false);
      assert.equal(window.isAlwaysOnTop(), true); assert.equal(window.getBounds().width, 440);
      window.webContents.send('desk:event', { type: 'answer-delta', delta: ' ao vivo', firstMs: 120 });
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.equal(await window.webContents.executeJavaScript(`$('answerBody').textContent`), 'Resposta preservada ao vivo');
      await fs.writeFile(path.join(root, 'tmp', 'compact.png'), (await window.webContents.capturePage()).toPNG());
      window.setSize(360, 340);
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.equal(await window.webContents.executeJavaScript(`document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight`), false);
      await window.webContents.executeJavaScript(`$('expand').click()`);
      await new Promise(resolve => setTimeout(resolve, 250));
      // Native window borders can round by one DIP at fractional Windows scaling.
      const restoredBounds = window.getNormalBounds();
      for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(restoredBounds[key] - fullBounds[key]) <= 2, `Restored ${key}`);
      assert.equal(window.isAlwaysOnTop(), false);
      results.restored = await window.webContents.executeJavaScript(`({compact: document.body.classList.contains('compact-mode'), capturing, controls: $('capture').parentElement.classList.contains('sidebar') && $('answer').parentElement.parentElement.classList.contains('question-footer'), question: $('question').value})`);
      assert.equal(results.restored.compact, false); assert.equal(results.restored.capturing, true);
      assert.equal(results.restored.controls, true); assert.equal(results.restored.question, 'Pending question');
      await window.webContents.executeJavaScript(`(async () => { await stopCapture(false); await desk.compact(true); await startCapture(true); })()`, true);
      results.compactStart = await window.webContents.executeJavaScript(`capturing`);
      assert.equal(results.compactStart, true);
      await window.webContents.executeJavaScript(`(async () => { await stopCapture(false); await desk.compact(false); })()`);
      await fs.mkdir(path.join(root, 'tmp'), { recursive: true });
      await fs.writeFile(path.join(root, 'tmp', 'interface.png'), (await window.webContents.capturePage()).toPNG());
      await fs.writeFile(path.join(root, 'tmp', 'smoke-result.json'), JSON.stringify(results, null, 2));
      console.log(JSON.stringify(results));
      const db = parseFloat(results.audio.level);
      process.exitCode = results.interface.overflow || !results.audio.capturing || !Number.isFinite(db) || db < -60 ? 1 : 0;
    } catch (e) { console.error(e); process.exitCode = 1; }
    finally { app.quit(); }
  });
});
require('../src/main.cjs');
