import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HboMaxAdapter, readEpisodes, readSeries, readSeasons } from '../src/hbomax.ts';
import { Controller } from '../src/controller.ts';
import { providerFor } from '../src/providers.ts';
import { hboFixture, hboEpisode, showId, episodeId } from './hbomax-fixtures.ts';

async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); }

test('tolera mayúsculas distintas en el título pero rechaza otra serie', () => {
  const { dom, doc } = hboFixture();
  doc.querySelector('main')!.setAttribute('aria-label', 'Two and a Half Men');
  doc.querySelector('[role="heading"]')!.setAttribute('aria-label', 'Two And A Half Men');
  assert.equal(readSeries(doc, dom.window.location.href).series.title, 'Two And A Half Men');
  doc.querySelector('main')!.setAttribute('aria-label', 'Otra serie');
  assert.throws(() => readSeries(doc, dom.window.location.href), /cargando/);
  dom.window.close();
});

test('elige proveedor por origen exacto y mantiene las rutas de Netflix', () => {
  assert.equal(providerFor('https://play.hbomax.com/home')?.id, 'hbomax');
  assert.equal(providerFor('https://www.netflix.com/browse')?.id, 'netflix');
  assert.equal(providerFor('https://play.hbomax.com.fake.test/home'), undefined);
  assert.equal(providerFor('http://play.hbomax.com/home'), undefined);
  assert.equal(providerFor('https://auth.hbomax.com'), undefined);
  assert.equal(providerFor('chrome://extensions'), undefined);
  assert.equal(providerFor('invalid'), undefined);
  assert.equal(providerFor('https://www.netflix.com')?.watchId('https://www.netflix.com/watch/101'), '101');
});
test('lee HBO Max, limpia marcas bidi y conserva el enlace con pos=0', () => {
  const { dom, doc } = hboFixture();
  const context = readSeries(doc, dom.window.location.href);
  assert.equal(context.series.id, showId);
  assert.equal(context.series.title, 'Serie de prueba');
  assert.deepEqual(readSeasons(context.section).map(s => s.id), ['1', '2']);
  const rows = readEpisodes(context.section, dom.window.location.href);
  assert.equal(rows.length, 2); // The trailer outside the panel is excluded.
  assert.equal(rows[0]!.episode.title, 'Un título. Con puntuación');
  assert.equal(rows[0]!.episode.url, `https://play.hbomax.com/video/watch/${episodeId(101)}?pos=0`);
  assert.equal(rows[1]!.episode.url, `https://play.hbomax.com/video/watch/${episodeId(102)}`);
  dom.window.close();
});
test('espera los enlaces de la temporada elegida y el total completo', async () => {
  const { dom, doc } = hboFixture();
  const adapter = new HboMaxAdapter(doc, () => dom.window.location.href);
  const signal = new AbortController().signal;
  const seasons = await adapter.seasons(signal);
  const rows = await adapter.episodes(seasons[1]!, signal);
  assert.deepEqual(rows.map(r => r.episode.id), [episodeId(201), episodeId(202), episodeId(203)]);
  dom.window.close();
});
test('admite una sola temporada sin desplegable', async () => {
  const { dom, doc } = hboFixture(true);
  const adapter = new HboMaxAdapter(doc, () => dom.window.location.href);
  const signal = new AbortController().signal;
  const seasons = await adapter.seasons(signal);
  assert.deepEqual(seasons, [{ id: '1', title: 'Temporada 1' }]);
  assert.equal((await adapter.episodes(seasons[0]!, signal)).length, 2);
  dom.window.close();
});
test('rechaza enlaces externos, identificadores incongruentes y etiquetas dañadas', () => {
  const { dom, doc } = hboFixture();
  const panel = doc.querySelector<HTMLElement>('[role="tabpanel"]')!;
  const first = panel.querySelector('a')!;
  const href = first.getAttribute('href')!;
  first.setAttribute('href', `https://other.test${href}`);
  assert.throws(() => readEpisodes(panel, dom.window.location.href), /formato/);
  first.setAttribute('href', href);
  first.setAttribute('data-sonic-id', episodeId(999));
  assert.throws(() => readEpisodes(panel, dom.window.location.href), /formato/);
  first.removeAttribute('data-sonic-id');
  first.setAttribute('aria-label', 'Episodio sin número ni total');
  assert.throws(() => readEpisodes(panel, dom.window.location.href), /formato/);
  dom.window.close();
});
test('rechaza ficha anterior mientras cambia la ruta y pantallas sin episodios', () => {
  const { dom, doc } = hboFixture();
  assert.throws(() => readSeries(doc, `https://play.hbomax.com/show/${episodeId(999)}`), /cambiando/);
  assert.throws(() => readSeries(doc, 'https://play.hbomax.com/home'), /Iniciá sesión/);
  dom.window.close();
});
test('no acepta episodios duplicados ni cantidades inconsistentes', async () => {
  const { dom, doc } = hboFixture(true);
  const adapter = new HboMaxAdapter(doc, () => dom.window.location.href);
  doc.getElementById('rows')!.innerHTML = hboEpisode(1, 1, 2) + hboEpisode(1, 1, 2);
  await assert.rejects(adapter.episodes({ id: '1', title: 'Temporada 1' }, new AbortController().signal), /duplicados/);
  doc.getElementById('rows')!.innerHTML = hboEpisode(1, 1, 2) + hboEpisode(1, 2, 3);
  await assert.rejects(adapter.episodes({ id: '1', title: 'Temporada 1' }, new AbortController().signal), /inconsistentes/);
  dom.window.close();
});
test('una lista parcial agota el tiempo sin sortear sobre ella', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { dom, doc } = hboFixture(true);
  doc.getElementById('rows')!.innerHTML = hboEpisode(1, 1, 2);
  const adapter = new HboMaxAdapter(doc, () => dom.window.location.href);
  const pending = assert.rejects(adapter.episodes({ id: '1', title: 'Temporada 1' }, new AbortController().signal), /tardó demasiado/);
  await flush();
  t.mock.timers.tick(16000);
  await pending;
  dom.window.close();
});
test('controlador HBO Max continúa sin popup y usa mensajes del proveedor correcto', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const { dom, doc } = hboFixture();
  let clicks = 0;
  doc.querySelector('a')!.addEventListener('click', event => {
    event.preventDefault();
    clicks++;
    dom.reconfigure({ url: `https://play.hbomax.com/video/watch/${episodeId(101)}?pos=0` });
  });
  const navigated: string[] = [];
  const controller = new Controller(doc, () => dom.window.location.href, url => navigated.push(url), () => 0);
  assert.equal(controller.status().series?.id, showId);
  controller.start(showId);
  controller.start(showId);
  await flush();
  assert.equal(clicks, 1);
  assert.match(controller.status().message, /Comprobando/);
  t.mock.timers.tick(21000);
  await flush();
  assert.equal(controller.status().phase, 'fallback');
  assert.match(controller.status().message, /HBO Max/);
  controller.open();
  assert.deepEqual(navigated, [`https://play.hbomax.com/video/watch/${episodeId(101)}?pos=0`]);
  dom.window.close();
});
