import * as netflix from './netflix.ts';
import * as hbo from './hbomax.ts';
import type { StreamingAdapter } from './types.ts';

export interface Provider {
  id: 'netflix' | 'hbomax';
  name: string;
  seriesId(url: string): string | undefined;
  watchId(url: string): string | undefined;
  readSeries(doc: Document, url: string): StreamingAdapter['context'];
  create(doc: Document, url: () => string): StreamingAdapter;
}
const netflixProvider: Provider = {
  id: 'netflix', name: 'Netflix', seriesId: netflix.seriesId, watchId: netflix.watchId,
  readSeries: netflix.readSeries, create: (doc, url) => new netflix.NetflixAdapter(doc, url)
};
const hboProvider: Provider = {
  id: 'hbomax', name: 'HBO Max', seriesId: hbo.seriesId, watchId: hbo.watchId,
  readSeries: hbo.readSeries, create: (doc, url) => new hbo.HboMaxAdapter(doc, url)
};
export function providerFor(url: string): Provider | undefined {
  try {
    if (netflix.isNetflix(url)) return netflixProvider;
    if (hbo.isHboMax(url)) return hboProvider;
  } catch { /* Unsupported or invalid tab URL. */ }
  return undefined;
}
