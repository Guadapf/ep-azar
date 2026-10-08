import { Controller } from './controller.ts';
import { ExtensionController } from './continuous.ts';
import { providerFor } from './providers.ts';
import type { Command } from './types.ts';

// Isolated-world singleton: reopening the popup must not register duplicate listeners.
const scope = globalThis as typeof globalThis & { __streamingRandomV3?: ExtensionController };
if (providerFor(location.href) && !scope.__streamingRandomV3) {
  const controller = new ExtensionController(new Controller(document, () => location.href, url => location.assign(url)), async request => {
    const response = await chrome.runtime.sendMessage({ channel: 'streaming-continuous-v1', ...request });
    if (!response || response.error) throw new Error(response?.error ?? 'No pude conectar con el modo continuo. Recargá la extensión.');
    return response.session;
  });
  scope.__streamingRandomV3 = controller;
  chrome.runtime.onMessage.addListener((request: Command, sender, reply) => {
    if (sender.id !== chrome.runtime.id || request?.channel !== 'streaming-random-v2') return;
    void controller.command(request).then(reply, () => reply({ phase: 'error', message: 'No pude conectar con la extensión. Recargá la pestaña.' }));
    return true;
  });
}
void scope.__streamingRandomV3?.refresh().catch(() => {});
