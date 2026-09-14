import { pick } from './random.ts';
import type { Episode, Season, Selection, Series, StreamingAdapter } from './types.ts';

export interface Catalog {
  series: Series;
  seasons: Array<{ season: Season; episodes: Episode[] }>;
}

// Read each season only once. Never retain DOM nodes after leaving the series page.
export async function readCatalog(adapter: StreamingAdapter, signal: AbortSignal, progress: (text: string) => void): Promise<Catalog> {
  const seasons = await adapter.seasons(signal);
  if (!seasons.length) throw new Error('No hay temporadas disponibles.');
  const catalog: Catalog = { series: adapter.context.series, seasons: [] };
  for (const [index, season] of seasons.entries()) {
    signal.throwIfAborted();
    progress(`Preparando ${season.title} (${index + 1} de ${seasons.length})…`);
    const rows = await adapter.episodes(season, signal);
    adapter.assertCurrent();
    if (!rows.length) throw new Error('No se pudo completar el catálogo. Volvé a intentarlo.');
    catalog.seasons.push({ season, episodes: rows.map(row => ({ ...row.episode })) });
  }
  signal.throwIfAborted();
  return catalog;
}

export function pickNext(catalog: Catalog, random = Math.random): Selection {
  const entry = pick(catalog.seasons, random);
  return { series: catalog.series, season: entry.season, episode: pick(entry.episodes, random) };
}
