import { Sessions, type ContinuousSession } from './continuous-session.ts';
import { providerFor } from './providers.ts';

const key = (tab: number) => `continuous:${tab}`;
const sessions = new Sessions({
  get: async tab => (await chrome.storage.session.get(key(tab)))[key(tab)] as ContinuousSession | undefined,
  put: async (tab, value) => chrome.storage.session.set({ [key(tab)]: value }),
  remove: async tab => chrome.storage.session.remove(key(tab)),
  url: async tab => (await chrome.tabs.get(tab)).url ?? '',
  navigate: async (tab, url) => { await chrome.tabs.update(tab, { url }); }
});

chrome.runtime.onMessage.addListener((request, sender, reply) => {
  if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || !sender.tab?.id || !sender.url || !providerFor(sender.url) || request?.channel !== 'streaming-continuous-v1') return;
  const tab = sender.tab.id;
  const allowed = ['get', 'stop', 'reroll', 'ended', 'arm', 'disarm'];
  if (request.type !== 'create' && !allowed.includes(request.type)) return;
  void sessions.serial(tab, async () => request.type === 'create'
    ? sessions.create(tab, request.catalog)
    : sessions.command(tab, request.type, request.token, request.remaining))
    .then(session => reply({ session }), () => reply({ error: 'No pude actualizar el modo continuo. Volvé a abrir la extensión.' }));
  return true;
});

chrome.tabs.onUpdated.addListener((tab, change) => {
  if (!change.url && change.status !== 'complete') return;
  void sessions.serial(tab, async () => {
    // Read the current URL; older onUpdated events can arrive after our own navigation.
    const current = await chrome.tabs.get(tab);
    const session = await sessions.changed(tab, current.url ?? '');
    if (session && change.status === 'complete') {
      try { await chrome.scripting.executeScript({ target: { tabId: tab }, files: ['content.js'] }); }
      catch { await chrome.storage.session.remove(key(tab)); }
    }
  }).catch(() => {});
});
chrome.tabs.onRemoved.addListener(tab => { void sessions.serial(tab, () => chrome.storage.session.remove(key(tab))).catch(() => {}); });
