import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NetflixAdapter, readEpisodes, readSeasons, readSeries, isNetflix, seriesId, watchId } from '../src/netflix.ts';
import { fixture } from './fixtures.ts';

test('valida origen e identifica la serie en las dos rutas observadas', () => {
  assert.equal(isNetflix('https://www.netflix.com/browse'), true);
  assert.equal(isNetflix('https://www.netflix.com.evil.example/browse'), false);
  assert.equal(seriesId('https://www.netflix.com/browse?jbv=123'), '123');
  assert.equal(seriesId('https://www.netflix.com/title/123'), '123');
  assert.equal(watchId('https://www.netflix.com/watch/101?trackId=2'), '101');
});
test('detecta serie y excluye la opción de ver todos los episodios', () => {
  const { doc, dom } = fixture();
  const { series, section } = readSeries(doc, dom.window.location.href);
  assert.deepEqual(series, { id: '123', title: 'Serie de prueba' });
  assert.deepEqual(readSeasons(section).map(s => s.episodeCount), [2, 3]);
  assert.deepEqual(readEpisodes(section).map(x => x.episode.id), ['101', '102']);
  dom.window.close();
});
test('espera una temporada nueva y expande hasta alcanzar el total anunciado', async () => {
  const { doc, dom } = fixture();
  const adapter = new NetflixAdapter(doc, () => dom.window.location.href);
  const signal = new AbortController().signal;
  const seasons = await adapter.seasons(signal);
  const rows = await adapter.episodes(seasons[1]!, signal);
  assert.deepEqual(rows.map(r => r.episode.id), ['201', '202', '203']);
  dom.window.close();
});
test('admite temporada única sin selector', async () => {
  const { doc, dom } = fixture(true);
  const adapter = new NetflixAdapter(doc, () => dom.window.location.href);
  const signal = new AbortController().signal;
  const seasons = await adapter.seasons(signal);
  assert.equal(seasons.length, 1);
  assert.equal((await adapter.episodes(seasons[0]!, signal)).length, 2);
  dom.window.close();
});
test('cancela si cambia la serie mientras se carga', async () => {
  const { doc, dom } = fixture();
  const adapter = new NetflixAdapter(doc, () => dom.window.location.href);
  const seasons = await adapter.seasons(new AbortController().signal);
  const operation = adapter.episodes(seasons[1]!, new AbortController().signal);
  dom.reconfigure({ url: 'https://www.netflix.com/browse?jbv=999' });
  await assert.rejects(operation, /ficha está cambiando|Cambiaste de serie/);
  // Allow the synthetic Netflix response to finish before destroying its document.
  await new Promise(r => setTimeout(r, 220));
  dom.window.close();
});
test('no usa una ficha anterior mientras cambia la URL', () => {
  const { doc, dom } = fixture();
  assert.throws(() => readSeries(doc, 'https://www.netflix.com/browse?jbv=999'), /ficha está cambiando/);
  dom.window.close();
});
test('no supone que una temporada única esté completa si falta el total', async () => {
  const { doc, dom } = fixture(true);
  doc.querySelector('.duration')!.remove();
  const adapter = new NetflixAdapter(doc, () => dom.window.location.href);
  await assert.rejects(adapter.seasons(new AbortController().signal), /total de episodios/);
  dom.window.close();
});
test('no sortea sobre metadatos rotos, ficha ausente ni sesión cerrada', () => {
  const { doc, dom } = fixture();
  const { section } = readSeries(doc, dom.window.location.href);
  section.querySelector('[data-ui-tracking-context]')!.setAttribute('data-ui-tracking-context', 'bad');
  assert.throws(() => readEpisodes(section), /formato/);
  assert.throws(() => readSeries(doc, 'https://www.netflix.com/login'), /Iniciá sesión/);
  assert.throws(() => readSeries(doc, 'https://www.netflix.com/browse'), /Más info/);
  dom.window.close();
});
