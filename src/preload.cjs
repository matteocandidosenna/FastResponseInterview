const { contextBridge, ipcRenderer } = require('electron');
const invoke = async (channel, ...args) => {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result.ok) throw new Error(result.error);
  return result.data;
};
contextBridge.exposeInMainWorld('desk', {
  init: () => invoke('desk:init'), settings: value => invoke('desk:settings', value),
  account: () => invoke('desk:account'), login: () => invoke('desk:login'), models: () => invoke('desk:models'),
  importFiles: () => invoke('desk:import'), remove: id => invoke('desk:remove', id),
  warmup: () => invoke('desk:warmup'), transcribe: audio => invoke('desk:transcribe', audio),
  answer: question => invoke('desk:answer', question), cancel: () => invoke('desk:cancel'), clear: () => invoke('desk:clear'),
  pin: value => invoke('desk:pin', value), export: text => invoke('desk:export', text),
  compact: value => invoke('desk:compact', value),
  onEvent: fn => { const listener = (_event, data) => fn(data); ipcRenderer.on('desk:event', listener); return () => ipcRenderer.removeListener('desk:event', listener); }
});
