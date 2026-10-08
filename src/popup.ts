import './popup.css';
import { providerFor } from './providers.ts';
import type { Command, Status } from './types.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const shuffle = $<HTMLButtonElement>('shuffle');
const open = $<HTMLButtonElement>('open');
const continuous = $<HTMLButtonElement>('continuous');
let tabId: number;
let latest: Status;
let polling = false;
let initialized = false;
let platform = 'Netflix, HBO Max o Disney+';
let onSeriesPage = false;
let sending = false;

function render(state: Status) {
  latest = state;
  $('platform').textContent = `EN ${platform.toUpperCase()}`;
  $('playback-note').textContent = platform === 'Disney+' ? 'Disney+: lista comprobada por paginación. Una carga muy lenta puede omitir episodios.' : `Se reproduce en ${platform} con tu sesión.`;
  $('series').textContent = state.series?.title ?? 'Abrí una serie';
  $('status').textContent = state.message;
  $('status').dataset.error = String(state.phase === 'error');
  const busy = state.phase === 'loading' || state.phase === 'opening';
  shuffle.disabled = sending || busy || !state.series || (state.continuous ? !state.next : !onSeriesPage || state.phase === 'playing');
  shuffle.textContent = state.continuous ? 'Volver a sortear el próximo' : busy ? 'Eligiendo tu episodio…' : 'Episodio al azar';
  continuous.textContent = state.continuous ? busy ? 'Cancelar preparación' : 'Desactivar modo continuo' : 'Iniciar modo continuo';
  continuous.disabled = sending || (!state.continuous && (busy || !onSeriesPage || !state.series));
  $('next-result').hidden = !state.next;
  if (state.next) {
    $('next-season').textContent = `PRÓXIMO · ${state.next.season.title} · Episodio ${state.next.episode.number}`;
    $('next-episode').textContent = state.next.episode.title;
  }
  $('result').hidden = !state.selection;
  if (state.selection) {
    $('season').textContent = `${state.selection.season.title} · Episodio ${state.selection.episode.number}`;
    $('episode').textContent = state.selection.episode.title;
  }
  open.hidden = state.phase !== 'fallback' || !!state.continuous;
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
    if (!tab?.id || !provider) { fail('Abrí la ficha de una serie en Netflix, HBO Max o Disney+ y volvé a abrir la extensión.'); return; }
    platform = provider.name;
    onSeriesPage = !!provider.seriesId(tab.url!) && !provider.watchId(tab.url!);
    tabId = tab.id;
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    render(await send('status'));
    initialized = true;
  } catch { fail('No pude acceder al sitio. Recargá la pestaña y volvé a abrir la extensión.'); }
}
shuffle.addEventListener('click', async () => {
  if (sending) return;
  sending = true;
  shuffle.disabled = true;
  try { latest = await send(latest.continuous ? 'reroll' : 'start'); } catch { fail('La pestaña cambió. Volvé a abrir la extensión.'); }
  finally { sending = false; render(latest); }
});
continuous.addEventListener('click', async () => {
  if (sending) return;
  sending = true;
  continuous.disabled = true;
  try { latest = await send(latest.continuous ? 'stop-continuous' : 'start-continuous'); }
  catch { fail('El sitio está cambiando de página. Volvé a abrir la extensión.'); }
  finally { sending = false; render(latest); }
});
open.addEventListener('click', async () => {
  open.disabled = true;
  try { render(await send('open')); } catch { fail('El sitio está cambiando de página. Volvé a abrir la extensión.'); }
  finally { open.disabled = false; }
});
setInterval(async () => {
  if (!initialized || polling || sending) return;
  polling = true;
  try {
    const tab = await chrome.tabs.get(tabId);
    const provider = tab.url ? providerFor(tab.url) : undefined;
    if (!tab.url || !provider) { initialized = false; fail('La pestaña cambió. Abrí una serie en Netflix, HBO Max o Disney+.'); return; }
    platform = provider.name;
    onSeriesPage = !!provider.seriesId(tab.url) && !provider.watchId(tab.url);
    const state = await send('status');
    render(state);
  } catch {
    // A full page navigation destroys the isolated world. Reopening grants fresh access.
    if (latest?.continuous) {
      $('status').textContent = 'Abriendo el próximo episodio…';
      shuffle.disabled = true;
    } else {
      initialized = false;
      fail('El sitio cambió de página. Volvé a abrir la extensión para consultar la ficha actual.');
    }
  } finally { polling = false; }
}, 500);
void initialize();
