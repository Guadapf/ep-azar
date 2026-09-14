import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Controller } from '../src/controller.ts';
import { fixture } from './fixtures.ts';
import { hboFixture, showId, episodeId } from './hbomax-fixtures.ts';

async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); }

for (const site of ['Netflix', 'HBO Max'] as const) {
  for (const returnWhileOpening of [false, true]) {
    test(`${site}: volver a la misma ficha ${returnWhileOpening ? 'mientras se comprueba el video' : 'después de reproducir'} permite otro sorteo`, async t => {
      t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
      const { dom, doc } = site === 'Netflix' ? fixture() : hboFixture();
      const sourceUrl = dom.window.location.href;
      const id = site === 'Netflix' ? '123' : showId;
      const playerUrl = site === 'Netflix' ? 'https://www.netflix.com/watch/101' : `https://play.hbomax.com/video/watch/${episodeId(101)}`;
      let clicks = 0;
      let time = 0;
      const video = doc.createElement('video');
      Object.defineProperties(video, {
        paused: { value: false }, readyState: { value: 4 }, currentTime: { get: () => ++time }
      });
      doc.body.append(video);
      doc.querySelector(site === 'Netflix' ? '.episode-item' : '[role="tabpanel"] a')!.addEventListener('click', event => {
        event.preventDefault();
        clicks++;
        dom.reconfigure({ url: playerUrl });
      });
      const controller = new Controller(doc, () => dom.window.location.href, () => {}, () => 0);
      controller.start(id);
      await flush();
      if (!returnWhileOpening) {
        t.mock.timers.tick(100);
        await flush();
        assert.equal(controller.status().phase, 'playing');
      } else {
        assert.equal(controller.status().phase, 'opening');
      }

      // A SPA back navigation retains the controller (and may retain a video/preview).
      // The popup can be closed throughout navigation: no status request is necessary.
      dom.reconfigure({ url: sourceUrl });
      t.mock.timers.tick(200);
      await flush();
      assert.equal(controller.status().phase, 'idle');
      assert.equal(controller.status().selection, undefined);
      assert.equal(controller.status().series?.id, id);
      assert.equal(controller.start(id).phase, 'loading');
      await flush();
      t.mock.timers.tick(100);
      await flush();
      assert.equal(clicks, 2);
      assert.equal(controller.status().phase, 'playing');
      dom.window.close();
    });
  }
}
