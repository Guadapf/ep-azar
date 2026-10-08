import { providerFor } from './providers.ts';

export function playbackVideo(doc: Document, url: string): HTMLVideoElement | undefined {
  const disney = providerFor(url)?.id === 'disneyplus';
  const ready = Array.from(doc.querySelectorAll<HTMLVideoElement>(disney ? 'video.hive-video' : 'video')).filter(video => video.isConnected && !video.hidden && video.style.display !== 'none' && video.readyState >= 2);
  return ready.length === 1 ? ready[0] : undefined;
}

// Disney's public seek slider lives in open shadow roots. Discover it once per
// video, then read its duration directly rather than scanning on timeupdate.
export function disneyTimeline(doc: Document): Element | undefined {
  const roots: (Document | ShadowRoot)[] = [doc];
  for (let i = 0; i < roots.length; i++) {
    const root = roots[i]!;
    const slider = root.querySelector('[data-qa="progress-bar.seekableRange"][role="slider"]');
    if (slider) return slider;
    for (const element of root.querySelectorAll('*')) if (element.shadowRoot) roots.push(element.shadowRoot);
  }
  return undefined;
}
