import './popup.css';
import { providerFor } from './providers.ts';
import type { Command, Status } from './types.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const shuffle = $<HTMLButtonElement>('shuffle');
const open = $<HTMLButtonElement>('open');
let tabId: number;
let latest: Status;
let polling = false;
let initialized = false;
let platform = 'Netflix o HBO Max';

function render(state: Status) {
  latest = state;
  $('platform').textContent = `EN ${platform.toUpperCase()}`;
  $('playback-note').textContent = `Se reproduce en ${platform} con tu sesión.`;
  $('series').textContent = state.series?.title ?? 'Abrí una serie';
  $('status').textContent = state.message;
  $('status').dataset.error = String(state.phase === 'error');
  const busy = state.phase === 'loading' || state.phase === 'opening';
  shuffle.disabled = busy || !state.series || state.phase === 'playing';
  shuffle.textContent = busy ? 'Eligiendo tu episodio…' : 'Episodio al azar';
  $('result').hidden = !state.selection;
  if (state.selection) {
    $('season').textContent = `${state.selection.season.title} · Episodio ${state.selection.episode.number}`;
    $('episode').textContent = state.selection.episode.title;
  }
  open.hidden = state.phase !== 'fallback';
}
async function send(type: Command['type']): Promise<Status> {
  return chrome.tabs.sendMessage(tabId, { channel: 'streaming-random-v2', type, seriesId: latest?.series?.id } satisfies Command);
}
function fail(text: string) { render({ phase: 'error', message: text }); }

async function initialize() {
  if (!globalThis.chrome?.tabs) {
    fail('Esta ventana funciona al instalar la extensión en Chrome o Brave.');
    return;
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const provider = tab?.url ? providerFor(tab.url) : undefined;
    if (!tab?.id || !provider) { fail('Abrí la ficha de una serie en Netflix o HBO Max y volvé a abrir la extensión.'); return; }
    platform = provider.name;
    tabId = tab.id;
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    render(await send('status'));
    initialized = true;
  } catch { fail('No pude acceder al sitio. Recargá la pestaña y volvé a abrir la extensión.'); }
}
shuffle.addEventListener('click', async () => {
  shuffle.disabled = true;
  try { render(await send('start')); } catch { fail('La pestaña cambió. Volvé a abrir la extensión.'); }
});
open.addEventListener('click', async () => {
  open.disabled = true;
  try { render(await send('open')); } catch { fail('El sitio está cambiando de página. Volvé a abrir la extensión.'); }
  finally { open.disabled = false; }
});
setInterval(async () => {
  if (!initialized || polling) return;
  polling = true;
  try {
    const tab = await chrome.tabs.get(tabId);
    const provider = tab.url ? providerFor(tab.url) : undefined;
    if (!tab.url || !provider) { initialized = false; fail('La pestaña cambió. Abrí una serie en Netflix o HBO Max.'); return; }
    platform = provider.name;
    const state = await send('status');
    render(state);
    shuffle.disabled ||= !provider.seriesId(tab.url) || !!provider.watchId(tab.url);
  } catch {
    // A full page navigation destroys the isolated world. Reopening grants fresh access.
    initialized = false;
    fail('El sitio cambió de página. Volvé a abrir la extensión para consultar la ficha actual.');
  } finally { polling = false; }
}, 500);
void initialize();
