import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Controller } from '../src/controller.ts';
import { fixture } from './fixtures.ts';

async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); }

test('el sorteo continúa sin popup, ignora doble clic y confirma avance del video', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const { doc, dom } = fixture();
  let clicks = 0;
  let samples = 0;
  const video = doc.createElement('video');
  Object.defineProperties(video, { paused: { value: false }, readyState: { value: 4 }, currentTime: { get: () => ++samples } });
  doc.querySelector('.episode-item')!.addEventListener('click', () => {
    clicks++;
    dom.reconfigure({ url: 'https://www.netflix.com/watch/101' });
    doc.body.append(video);
  });
  const controller = new Controller(doc, () => dom.window.location.href, () => {}, () => 0);
  assert.equal(controller.start('123').phase, 'loading');
  assert.equal(controller.start('123').phase, 'loading');
  // No status requests during the job: the popup may already be closed.
  await flush();
  t.mock.timers.tick(100);
  await flush();
  assert.equal(clicks, 1);
  assert.equal(controller.status().phase, 'playing');
  assert.equal(controller.status().selection?.episode.id, '101');
  dom.window.close();
});

test('si el reproductor no inicia conserva el episodio y permite abrirlo', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const { doc, dom } = fixture();
  const navigations: string[] = [];
  doc.querySelector('.episode-item')!.addEventListener('click', () => dom.reconfigure({ url: 'https://www.netflix.com/watch/101' }));
  const controller = new Controller(doc, () => dom.window.location.href, url => navigations.push(url), () => 0);
  controller.start('123');
  await flush();
  t.mock.timers.tick(21000);
  await flush();
  assert.equal(controller.status().phase, 'fallback');
  controller.open();
  assert.deepEqual(navigations, ['https://www.netflix.com/watch/101']);
  dom.window.close();
});

test('descarta resultados si se navega a otra serie', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const { doc, dom } = fixture();
  const controller = new Controller(doc, () => dom.window.location.href, () => {}, () => 0);
  controller.start('123');
  await flush();
  dom.reconfigure({ url: 'https://www.netflix.com/browse?jbv=999' });
  t.mock.timers.tick(200);
  await flush();
  assert.equal(controller.status().selection, undefined);
  assert.equal(controller.status().phase, 'error');
  dom.window.close();
});

test('rechaza un sorteo solicitado para una ficha anterior', () => {
  const { doc, dom } = fixture();
  const controller = new Controller(doc, () => dom.window.location.href, () => {});
  assert.equal(controller.start('999').phase, 'error');
  dom.window.close();
});
