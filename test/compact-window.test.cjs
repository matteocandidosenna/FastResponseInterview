const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { attachCompactWindow } = require('../src/compact-window.cjs');

function harness({ maximized = false, pinned = false } = {}) {
  const win = new EventEmitter();
  Object.assign(win, {
    bounds: { x: 60, y: 70, width: 1360, height: 900 }, maximized, pinned, minimized: false,
    isDestroyed: () => false, isMaximized() { return this.maximized; }, isAlwaysOnTop() { return this.pinned; },
    isMinimized() { return this.minimized; }, getNormalBounds() { return { ...this.bounds }; },
    restore() { this.minimized = false; }, unmaximize() { this.maximized = false; this.emit('unmaximize'); },
    maximize() { this.maximized = true; this.emit('maximize'); }, setMinimumSize(...size) { this.minimum = size; },
    setMaximizable(value) { this.maximizable = value; }, setBounds(bounds) { this.bounds = { ...bounds }; },
    setAlwaysOnTop(value) { this.pinned = value; }, setTitle(value) { this.title = value; }
  });
  const screen = { area: { x: 0, y: 0, width: 1920, height: 1040 }, getDisplayMatching() { return { workArea: this.area }; } };
  const events = [];
  return { win, screen, events, controller: attachCompactWindow(win, screen, mode => events.push(mode)) };
}

test('minimizing opens the compact panel and expanding restores bounds and pin preference', async () => {
  const { win, events, controller } = harness();
  const original = win.getNormalBounds();
  win.minimized = true; win.emit('minimize');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(win.minimized, false); assert.equal(win.pinned, true);
  assert.equal(win.bounds.width, 440); assert.equal(win.maximizable, false);
  controller.setCompact(false);
  assert.deepEqual(win.bounds, original); assert.equal(win.pinned, false);
  assert.deepEqual(win.minimum, [1000, 700]); assert.deepEqual(events, [true, false]);
});

test('maximized and pinned windows return to their previous state across repeated toggles', () => {
  const { win, controller } = harness({ maximized: true, pinned: true });
  for (let i = 0; i < 3; i++) {
    controller.setCompact(true); assert.equal(win.maximized, false);
    controller.setCompact(false); assert.equal(win.maximized, true); assert.equal(win.pinned, true);
  }
});

test('compact bounds are remembered and clamped after a monitor change', () => {
  const { win, screen, controller } = harness();
  controller.setCompact(true); win.bounds = { x: 1300, y: 400, width: 460, height: 520 };
  controller.setCompact(false); controller.setCompact(true);
  assert.deepEqual(win.bounds, { x: 1300, y: 400, width: 460, height: 520 });
  controller.setCompact(false); screen.area = { x: -1280, y: 0, width: 1280, height: 720 };
  controller.setCompact(true);
  assert.equal(win.bounds.x, -460); assert.equal(win.bounds.y, 200);
});

test('minimizing the compact panel does not reopen it', async () => {
  const { win, events, controller } = harness();
  controller.setCompact(true); win.minimized = true; win.emit('minimize');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(win.minimized, true); assert.deepEqual(events, [true]);
});
