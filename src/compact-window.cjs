// Keep one renderer so audio and streamed answers survive switching views.
function attachCompactWindow(win, screen, notify) {
  let compact = false, fullBounds, compactBounds, fullMaximized = win.isMaximized(), fullPinned = win.isAlwaysOnTop();
  win.on('maximize', () => { if (!compact) fullMaximized = true; });
  win.on('unmaximize', () => { if (!compact) fullMaximized = false; });
  function setCompact(value) {
    if (win.isDestroyed() || compact === value) return compact;
    if (value) {
      fullBounds = win.getNormalBounds();
      fullPinned = win.isAlwaysOnTop();
      compact = true;
      if (win.isMinimized()) win.restore();
      if (win.isMaximized()) win.unmaximize();
      win.setMinimumSize(360, 340);
      win.setMaximizable(false);
      const area = screen.getDisplayMatching(compactBounds || fullBounds).workArea;
      const width = Math.min(compactBounds?.width || 440, area.width);
      const height = Math.min(compactBounds?.height || 500, area.height);
      win.setBounds({ width, height,
        x: Math.max(area.x, Math.min(compactBounds?.x ?? area.x + area.width - width - 24, area.x + area.width - width)),
        y: Math.max(area.y, Math.min(compactBounds?.y ?? area.y + area.height - height - 24, area.y + area.height - height)) });
      win.setAlwaysOnTop(true);
      win.setTitle('Interview Desk · Compacto');
    } else {
      compactBounds = win.getNormalBounds();
      win.setMinimumSize(1000, 700);
      win.setMaximizable(true);
      win.setBounds(fullBounds);
      win.setAlwaysOnTop(fullPinned);
      if (fullMaximized) win.maximize();
      compact = false;
      win.setTitle('Interview Desk');
    }
    notify(compact);
    return compact;
  }
  win.on('minimize', () => {
    // Wait until Windows has finished the native minimize transition.
    if (!compact) setImmediate(() => setCompact(true));
  });
  return { setCompact, isCompact: () => compact };
}
module.exports = { attachCompactWindow };
