import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DisneyPlusAdapter, readSeries, readEpisodes, seriesId, watchId } from '../src/disneyplus.ts';
import { providerFor } from '../src/providers.ts';
import { playbackVideo } from '../src/playback.ts';
import { readCatalog } from '../src/catalog.ts';
import { Controller } from '../src/controller.ts';
import { ContinuousPlayer } from '../src/continuous-player.ts';
import { Sessions, type ContinuousSession } from '../src/continuous-session.ts';
import { disneyFixture, disneyId, disneyShow, disneyUrl } from './disneyplus-fixtures.ts';
async function flush() { for (let i = 0; i < 60; i++) await Promise.resolve(); }
const signal = () => new AbortController().signal;

test('Disney+: origen exacto, rutas localizadas y UUID completos', () => {
  assert.equal(providerFor(disneyUrl)?.id, 'disneyplus');
  assert.equal(seriesId(disneyUrl), disneyShow);
  assert.equal(seriesId(`https://www.disneyplus.com/browse/entity-${disneyShow}/`), disneyShow);
  assert.equal(watchId(`https://www.disneyplus.com/es-AR/play/${disneyId(101)}?contextId=x`), disneyId(101));
  assert.equal(watchId(`https://www.disneyplus.com/es-419/play/${disneyId(101)}/extra`), undefined);
  assert.equal(providerFor('https://www.disneyplus.com.evil.test'), undefined);
  assert.equal(providerFor('http://www.disneyplus.com'), undefined);
  assert.equal(providerFor('https://accounts.disneyplus.com'), undefined);
});
test('Disney+: título, metadatos, enlaces exactos y rechazo de DOM incoherente', () => {
  const { doc, dom, set } = disneyFixture();
  assert.equal(readSeries(doc, disneyUrl).series.title, 'Serie de prueba');
  const row = readEpisodes(set, disneyUrl)[0]!;
  assert.equal(row.episode.title, 'Capítulo 1');
  assert.equal(row.episode.duration, 1406);
  assert.equal(row.episode.url, `https://www.disneyplus.com/es-419/play/${disneyId(101)}?source=card`);
  const anchor = set.querySelector('a')!;
  const href = anchor.href;
  anchor.href = 'https://evil.test/play/' + disneyId(101);
  assert.throws(() => readEpisodes(set, disneyUrl), /formato/);
  anchor.href = href; anchor.dataset.itemId = disneyId(999);
  assert.throws(() => readEpisodes(set, disneyUrl), /formato/);
  anchor.dataset.itemId = disneyId(101); anchor.insertAdjacentHTML('afterend', anchor.outerHTML);
  assert.throws(() => readEpisodes(set, disneyUrl), /duplicados/);
  doc.title = 'Otra serie | Disney+';
  assert.throws(() => readSeries(doc, disneyUrl), /cargando/);
  doc.title = 'Serie de prueba | Disney+'; doc.getElementById('episodes')!.remove();
  assert.throws(() => readSeries(doc, disneyUrl), /Iniciá sesión/);
  dom.window.close();
});
test('Disney+: prepara todas las temporadas y recorre páginas antes de sortear', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { doc, dom, scrolls } = disneyFixture();
  doc.querySelector('a')!.insertAdjacentHTML('beforeend', '<progress role="progressbar" value="38" max="100"></progress>');
  const adapter = new DisneyPlusAdapter(doc, () => dom.window.location.href);
  let completed = false;
  const pending = readCatalog(adapter, signal(), () => {}).then(result => { completed = true; return result; });
  await flush();
  for (let i = 0; i < 20; i++) { t.mock.timers.tick(100); await flush(); }
  assert.equal(completed, false);
  for (let i = 0; i < 90; i++) { t.mock.timers.tick(100); await flush(); }
  const result = await pending;
  assert.deepEqual(result.seasons.map(s => s.episodes.length), [2, 3]);
  assert.ok(scrolls() >= 3);
  assert.doesNotThrow(() => structuredClone(result));
  dom.window.close();
});
test('Disney+: duración publicada sin segundos y línea de tiempo en shadow DOM', () => {
  const { doc, dom } = disneyFixture(true);
  doc.querySelector('[data-testid="standard-regular-list-metadata"]')!.textContent = '(23 min)23 minutos';
  assert.equal(readEpisodes(doc.getElementById('episodes')!, disneyUrl)[0]!.episode.duration, 1380);
  const host = doc.createElement('div'); doc.body.append(host);
  host.attachShadow({ mode: 'open' }).innerHTML = '<div><input role="slider" data-qa="progress-bar.seekableRange" aria-valuemax="1466"></div>';
  const video = doc.createElement('video'); video.className = 'hive-video'; doc.body.append(video);
  let time = 1400;
  Object.defineProperties(video, { duration: { value: Infinity }, readyState: { value: 4 }, paused: { value: false }, currentTime: { get: () => time } });
  const episode = readEpisodes(doc.getElementById('episodes')!, disneyUrl)[0]!.episode;
  const selection = { series: { id: disneyShow, title: 'Prueba' }, season: { id: disneyId(1), title: 'Temporada 1' }, episode };
  dom.reconfigure({ url: episode.url });
  const remaining: number[] = [];
  const player = new ContinuousPlayer(doc, () => dom.window.location.href, (action, _session, seconds) => { if (action === 'arm') remaining.push(seconds!); });
  player.set({ id: 'test', generation: 0, current: selection, next: selection });
  video.dispatchEvent(new dom.window.Event('timeupdate')); time++;
  video.dispatchEvent(new dom.window.Event('timeupdate'));
  assert.deepEqual(remaining, [65]);
  player.dispose(); dom.window.close();
});
test('Disney+: una temporada sin menú; cancelar interrumpe la paginación', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { doc, dom } = disneyFixture(true);
  const adapter = new DisneyPlusAdapter(doc, () => dom.window.location.href);
  const seasons = await adapter.seasons(signal());
  assert.deepEqual(seasons, [{ id: disneyId(1), title: 'Temporada 1' }]);
  const abort = new AbortController();
  const pending = assert.rejects(adapter.episodes(seasons[0]!, abort.signal), /cancelado/);
  await flush(); abort.abort(new Error('cancelado')); t.mock.timers.tick(100); await pending;
  dom.window.close();
});
test('Disney+: no da por completa una lista ocupada y detecta cambio de temporada', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { doc, dom } = disneyFixture();
  const adapter = new DisneyPlusAdapter(doc, () => dom.window.location.href);
  const seasons = await adapter.seasons(signal());
  doc.getElementById('episodes')!.setAttribute('aria-busy', 'true');
  let completed = false;
  const pending = assert.rejects(adapter.episodes(seasons[0]!, signal()).then(() => { completed = true; }), /Cambiaste de temporada/);
  await flush();
  for (let i = 0; i < 40; i++) { t.mock.timers.tick(100); await flush(); }
  assert.equal(completed, false);
  doc.querySelector('button')!.textContent = 'Temporada 2';
  t.mock.timers.tick(100); await pending;
  dom.window.close();
});
test('Disney+: cambio de serie durante paginación cancela el resultado', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { doc, dom } = disneyFixture(true);
  const adapter = new DisneyPlusAdapter(doc, () => dom.window.location.href);
  const seasons = await adapter.seasons(signal());
  const pending = assert.rejects(adapter.episodes(seasons[0]!, signal()), /Cambiaste de serie/);
  await flush(); dom.reconfigure({ url: disneyUrl.replace(disneyShow, disneyId(901)) });
  t.mock.timers.tick(100); await pending; dom.window.close();
});
test('Disney+: sorteo sin popup bloquea doble clic y confirma el video activo con duración infinita', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const { doc, dom, rows } = disneyFixture(true);
  const hidden = doc.createElement('video'); hidden.style.display = 'none'; doc.body.append(hidden);
  const video = doc.createElement('video'); video.className = 'hive-video';
  let time = 1, clicks = 0;
  Object.defineProperties(video, { readyState: { value: 4 }, paused: { value: false }, duration: { value: Infinity }, currentTime: { get: () => time++ } });
  rows.querySelector('a')!.addEventListener('click', event => {
    event.preventDefault(); clicks++; dom.reconfigure({ url: `https://www.disneyplus.com/es-419/play/${disneyId(101)}` }); doc.body.append(video);
  });
  const controller = new Controller(doc, () => dom.window.location.href, () => {}, () => 0);
  controller.start(disneyShow); controller.start(disneyShow); await flush();
  for (let i = 0; i < 60; i++) { t.mock.timers.tick(100); await flush(); }
  assert.equal(clicks, 1); assert.equal(controller.status().phase, 'playing');
  assert.equal(playbackVideo(doc, dom.window.location.href), video);
  dom.reconfigure({ url: disneyUrl }); assert.equal(controller.status().phase, 'idle');
  dom.window.close();
});
test('Disney+: sesión continua encadena, recupera y usa duración del catálogo para los créditos', async () => {
  const { doc, dom } = disneyFixture(true);
  const episode = readEpisodes(doc.getElementById('episodes')!, disneyUrl)[0]!.episode;
  const catalog = { series: { id: disneyShow, title: 'Serie de prueba' }, seasons: [{ season: { id: disneyId(1), title: 'Temporada 1' }, episodes: [episode] }] };
  let stored: ContinuousSession | undefined, url = disneyUrl;
  const navigations: string[] = [];
  const ports = { get: async () => stored, put: async (_: number, value: ContinuousSession) => { stored = value; }, remove: async () => { stored = undefined; }, url: async () => url, navigate: async (_: number, value: string) => { url = value; navigations.push(value); } };
  const sessions = new Sessions(ports, () => 0);
  const session = await sessions.create(1, catalog);
  assert.equal((await new Sessions(ports).command(1, 'get'))!.current.episode.duration, 1406);
  dom.reconfigure({ url });
  const placeholder = doc.createElement('video'); doc.body.append(placeholder);
  const video = doc.createElement('video'); video.className = 'hive-video'; doc.body.append(video);
  let time = 1350, ended = false;
  Object.defineProperties(video, { duration: { value: Infinity }, currentTime: { get: () => time }, readyState: { value: 4 }, paused: { value: false }, ended: { get: () => ended } });
  const actions: string[] = [], jobs: Promise<unknown>[] = [];
  const player = new ContinuousPlayer(doc, () => url, (action, token, remaining) => { actions.push(action); jobs.push(sessions.serial(1, () => sessions.command(1, action, token, remaining))); });
  player.set(session);
  placeholder.dispatchEvent(new dom.window.Event('ended'));
  video.dispatchEvent(new dom.window.Event('timeupdate')); time++;
  video.dispatchEvent(new dom.window.Event('timeupdate')); await Promise.all(jobs);
  assert.deepEqual(actions, ['arm']);
  ended = true; video.dispatchEvent(new dom.window.Event('ended')); video.dispatchEvent(new dom.window.Event('ended'));
  await Promise.all(jobs);
  assert.deepEqual(actions, ['arm', 'ended']); assert.equal(navigations.length, 2);
  assert.equal(stored!.generation, 1);
  player.dispose(); dom.window.close();
});
