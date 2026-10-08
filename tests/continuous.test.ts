import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCatalog, pickNext, type Catalog } from '../src/catalog.ts';
import { Sessions, type ContinuousSession } from '../src/continuous-session.ts';
import { ContinuousPlayer } from '../src/continuous-player.ts';
import { ExtensionController } from '../src/continuous.ts';
import { Controller } from '../src/controller.ts';
import { providerFor } from '../src/providers.ts';
import { fixture } from './fixtures.ts';
import { hboFixture, showId } from './hbomax-fixtures.ts';

async function flush() { for (let i = 0; i < 80; i++) await Promise.resolve(); }
const catalog: Catalog = {
  series: { id: '123', title: 'Prueba' },
  seasons: [1, 2].map(n => ({ season: { id: String(n), title: `Temporada ${n}` }, episodes: Array.from({ length: n }, (_, i) => ({ id: `${n}0${i + 1}`, title: 'Capítulo', number: i + 1, url: `https://www.netflix.com/watch/${n}0${i + 1}` })) }))
};
function harness() {
  const stored = new Map<number, ContinuousSession>();
  const urls = new Map([[1, 'https://www.netflix.com/browse?jbv=123'], [2, 'https://www.netflix.com/browse?jbv=123']]);
  const navigations: string[] = [];
  let value = 0;
  let failNavigation = false;
  const ports = {
    get: async (tab: number) => structuredClone(stored.get(tab)),
    put: async (tab: number, session: ContinuousSession) => { stored.set(tab, structuredClone(session)); },
    remove: async (tab: number) => { stored.delete(tab); },
    url: async (tab: number) => urls.get(tab)!,
    navigate: async (tab: number, url: string) => { if (failNavigation) throw new Error('blocked'); navigations.push(url); urls.set(tab, url); }
  };
  const sessions = new Sessions(ports, () => value, () => 1000);
  return { sessions, stored, urls, navigations, ports, random: (n: number) => { value = n; }, fail: () => { failNavigation = true; } };
}

for (const site of ['Netflix', 'HBO Max']) {
  test(`${site}: prepara todas las temporadas una sola vez sin retener elementos DOM`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
    const { doc, dom } = site === 'Netflix' ? fixture() : hboFixture();
    const adapter = providerFor(dom.window.location.href)!.create(doc, () => dom.window.location.href);
    const progress: string[] = [];
    const pending = readCatalog(adapter, new AbortController().signal, text => progress.push(text));
    await flush();
    for (let i = 0; i < 8; i++) { t.mock.timers.tick(100); await flush(); }
    const result = await pending;
    assert.deepEqual(result.seasons.map(s => s.episodes.length), [2, 3]);
    assert.equal(progress.length, 2);
    assert.doesNotThrow(() => structuredClone(result));
    for (let i = 0; i < 20; i++) pickNext(result);
    assert.equal(progress.length, 2);
    dom.window.close();
  });
}

test('el catálogo mantiene temporadas equiprobables y rechaza opciones vacías', () => {
  assert.equal(pickNext(catalog, () => .49).season.id, '1');
  assert.equal(pickNext(catalog, () => .5).season.id, '2');
  assert.equal(pickNext(catalog, () => .99999).episode.id, '202');
  assert.throws(() => pickNext({ ...catalog, seasons: [] }));
});

test('sortear próximo no navega; final duplicado avanza una sola vez incluso si se repite episodio', async () => {
  const h = harness();
  const initial = await h.sessions.create(1, catalog);
  const rerolled = await h.sessions.command(1, 'reroll', initial);
  assert.equal(h.navigations.length, 1);
  assert.equal(rerolled!.current.episode.id, initial.current.episode.id);
  await Promise.all([1, 2].map(() => h.sessions.serial(1, () => h.sessions.command(1, 'ended', initial))));
  assert.equal(h.navigations.length, 2);
  assert.equal(h.stored.get(1)!.generation, 1);
});

test('recupera catálogo tras reiniciar worker, sin mezclar pestañas, y detener borra la sesión', async () => {
  const h = harness();
  await h.sessions.create(1, catalog);
  h.random(.99);
  await h.sessions.create(2, catalog);
  const restored = new Sessions(h.ports, () => .5);
  const first = await restored.command(1, 'get');
  assert.equal(first!.current.episode.id, '101');
  assert.equal((await restored.command(2, 'get'))!.current.episode.id, '202');
  assert.equal('catalog' in first!, false);
  await restored.command(1, 'stop');
  await restored.command(1, 'ended', first);
  assert.equal(h.navigations.length, 2);
  assert.equal(h.stored.has(1), false);
  assert.equal(h.stored.has(2), true);
});

test('vuelta a ficha cancela incluso durante créditos; navegación ajena no se secuestra', async () => {
  const h = harness();
  const session = await h.sessions.create(1, catalog);
  await h.sessions.command(1, 'arm', session, 30);
  await h.sessions.changed(1, 'https://www.netflix.com/browse?jbv=123');
  assert.equal(h.stored.has(1), false);
  assert.equal(h.navigations.length, 1);
});

test('avance nativo durante créditos usa el episodio sorteado; fuera de créditos cancela', async () => {
  const h = harness();
  const session = await h.sessions.create(1, catalog);
  await h.sessions.command(1, 'arm', session, 30);
  await h.sessions.changed(1, 'https://www.netflix.com/watch/201');
  assert.equal(h.navigations.at(-1), session.next.episode.url);
  assert.equal(h.stored.get(1)!.generation, 1);
  await h.sessions.changed(1, 'https://www.netflix.com/watch/202');
  assert.equal(h.stored.has(1), false);
});

test('falla de navegación se registra y enlaces de otro sitio se rechazan', async () => {
  const h = harness();
  const bad = structuredClone(catalog);
  bad.seasons[0]!.episodes[0]!.url = 'https://evil.example/watch/101';
  await assert.rejects(h.sessions.create(1, bad));
  h.fail();
  const failed = await h.sessions.create(1, catalog);
  assert.match(failed.error!, /No pude abrir/);
  assert.equal(h.navigations.length, 0);
});

test('eventos de video: ignora previews y pausa, evita fin doble y deja de actuar al desactivar', async () => {
  const h = harness();
  const session = await h.sessions.create(1, catalog);
  const { dom, doc } = fixture();
  const video = doc.createElement('video');
  doc.body.append(video);
  let time = 1, duration = 30, ended = false, paused = false;
  Object.defineProperties(video, {
    duration: { get: () => duration }, currentTime: { get: () => time },
    ended: { get: () => ended }, paused: { get: () => paused }, readyState: { value: 4 }
  });
  const actions: string[] = [];
  const player = new ContinuousPlayer(doc, () => dom.window.location.href, action => actions.push(action));
  player.set(session);
  const emit = (name: string) => video.dispatchEvent(new dom.window.Event(name));
  ended = true; emit('ended'); assert.deepEqual(actions, []);
  dom.reconfigure({ url: session.current.episode.url });
  ended = false; duration = 1200; time = 1150;
  emit('timeupdate'); time++; emit('timeupdate'); emit('timeupdate');
  assert.deepEqual(actions, ['arm']);
  paused = true; emit('pause'); assert.deepEqual(actions, ['arm', 'disarm']);
  paused = false; time++; emit('timeupdate'); time++; emit('timeupdate');
  ended = true; emit('ended'); emit('ended');
  assert.equal(actions.filter(a => a === 'ended').length, 1);
  player.set(undefined); emit('ended');
  assert.equal(actions.filter(a => a === 'ended').length, 1);
  player.dispose(); dom.window.close();
});

test('preparación continúa sin popup y bloquea sorteo simultáneo; cancelarla no navega', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const { dom, doc } = hboFixture();
  const requests: string[] = [];
  const controller = new ExtensionController(new Controller(doc, () => dom.window.location.href, () => {}), async req => { requests.push(req.type); return undefined; });
  const command = (type: 'start-continuous' | 'stop-continuous' | 'start' | 'status') => controller.command({ channel: 'streaming-random-v2', type, seriesId: showId });
  assert.equal((await command('start-continuous')).phase, 'loading');
  assert.equal((await command('start')).phase, 'loading');
  await flush();
  await command('stop-continuous');
  for (let i = 0; i < 8; i++) { t.mock.timers.tick(100); await flush(); }
  assert.equal(requests.includes('create'), false);
  controller.dispose(); dom.window.close();
});

test('flujo completo: prepara sin popup, recupera tras recargar y encadena con un solo evento de fin', async () => {
  const h = harness();
  let { dom, doc } = fixture(true);
  const transport: ConstructorParameters<typeof ExtensionController>[1] = req => h.sessions.serial(1, () => req.type === 'create'
    ? h.sessions.create(1, req.catalog)
    : h.sessions.command(1, req.type, req.token, req.remaining));
  let controller = new ExtensionController(new Controller(doc, () => dom.window.location.href, () => {}), transport);
  const request = (type: 'start-continuous' | 'status' | 'reroll' | 'stop-continuous') => ({ channel: 'streaming-random-v2' as const, type, seriesId: '123' });
  await controller.command(request('start-continuous'));
  await flush();
  assert.equal(h.navigations.length, 1);
  assert.equal(h.stored.get(1)!.catalog.seasons[0]!.episodes.length, 2);
  controller.dispose(); dom.window.close();
  ({ dom, doc } = fixture(true));
  dom.reconfigure({ url: h.urls.get(1)! });
  controller = new ExtensionController(new Controller(doc, () => dom.window.location.href, () => {}), transport);
  const recovered = await controller.command(request('status'));
  assert.equal(recovered.continuous, true);
  assert.equal(recovered.next!.episode.id, '101');
  h.random(.99);
  const next = await controller.command(request('reroll'));
  assert.equal(next.next!.episode.id, '102');
  assert.equal(h.navigations.length, 1);
  const video = doc.createElement('video');
  Object.defineProperties(video, { duration: { value: 1200 }, ended: { value: true }, readyState: { value: 4 } });
  doc.body.append(video);
  video.dispatchEvent(new dom.window.Event('ended'));
  video.dispatchEvent(new dom.window.Event('ended'));
  await flush();
  await controller.command(request('status'));
  video.dispatchEvent(new dom.window.Event('ended'));
  await flush();
  assert.equal(h.navigations.length, 2);
  assert.equal(h.navigations.at(-1), 'https://www.netflix.com/watch/102');
  await controller.command(request('stop-continuous'));
  assert.equal(h.stored.has(1), false);
  controller.dispose(); dom.window.close();
});

test('volver atrás desde el reproductor desactiva la escucha sin esperar al popup', async () => {
  const h = harness();
  const session = await h.sessions.create(1, catalog);
  const { dom, doc } = fixture();
  const actions: string[] = [];
  const player = new ContinuousPlayer(doc, () => dom.window.location.href, type => actions.push(type));
  player.set(session);
  dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate'));
  assert.deepEqual(actions, ['stop']);
  player.dispose(); dom.window.close();
});
