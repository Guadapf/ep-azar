import { Controller } from './controller.ts';
import { providerFor } from './providers.ts';
import type { Command } from './types.ts';

// Isolated-world singleton: reopening the popup must not register duplicate listeners.
const scope = globalThis as typeof globalThis & { __streamingRandomV2?: Controller };
if (providerFor(location.href) && !scope.__streamingRandomV2) {
  const controller = new Controller(document, () => location.href, url => location.assign(url));
  scope.__streamingRandomV2 = controller;
  chrome.runtime.onMessage.addListener((request: Command, sender, reply) => {
    if (sender.id !== chrome.runtime.id || request?.channel !== 'streaming-random-v2') return;
    if (request.type === 'status') reply(controller.status());
    if (request.type === 'start') reply(controller.start(request.seriesId));
    if (request.type === 'open') reply(controller.open());
  });
}
