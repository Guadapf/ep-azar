import type { EpisodeRow, Season, StreamingAdapter } from './types.ts';
import { waitFor } from './wait.ts';

const normalize = (text: string | null | undefined) => (text ?? '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim();
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const locale = '(?:[a-z]{2}(?:-[a-z]{2}|-\\d{3})?/)?';
export const selectors = {
  root: '[data-testid="explore-details-view"]', panel: '#episodes[role="tabpanel"]',
  toggle: '[data-testid="dropdown-button"]', option: '[role="option"]',
  set: 'section[data-testid="set-section"][data-set-id]',
  episode: 'a[data-testid="set-item"]', spy: '[data-testid="grid-pagination-spy"]'
};
export function isDisneyPlus(url: string): boolean {
  const parsed = new URL(url);
  return parsed.protocol === 'https:' && parsed.hostname === 'www.disneyplus.com';
}
export function seriesId(url: string): string | undefined {
  return new URL(url).pathname.match(new RegExp(`^/${locale}browse/entity-(${uuid})/?$`, 'i'))?.[1]?.toLowerCase();
}
export function watchId(url: string): string | undefined {
  return new URL(url).pathname.match(new RegExp(`^/${locale}play/(${uuid})/?$`, 'i'))?.[1]?.toLowerCase();
}
export function readSeries(doc: Document, url: string) {
  const id = isDisneyPlus(url) ? seriesId(url) : undefined;
  const root = doc.querySelector<HTMLElement>(selectors.root);
  const section = root?.querySelector<HTMLElement>(selectors.panel);
  if (!id || !root || !section || section.hidden || section.getAttribute('aria-hidden') === 'true') throw new Error('Iniciá sesión en Disney+ y abrí la pestaña «Episodios» de una serie.');
  const title = normalize(root.querySelector('[data-testid="details-title-treatment"] img')?.getAttribute('alt') ?? root.querySelector('[data-testid="details-tab-title"]')?.textContent);
  if (!title || normalize(doc.title).split(' | ')[0] !== title) throw new Error('La ficha está cargando. Esperá y volvé a abrir la extensión.');
  return { series: { id, title }, root, section };
}
export function readSeasons(panel: HTMLElement): Season[] {
  const seasons = Array.from(panel.querySelectorAll<HTMLElement>(selectors.option)).flatMap(option => {
    const title = normalize(option.getAttribute('title') ?? option.textContent);
    if (!/^Temporada [1-9]\d*$/.test(title) || option.getAttribute('aria-disabled') === 'true') return [];
    if (!new RegExp(`^${uuid}$`, 'i').test(option.id)) throw new Error('Disney+ cambió el formato de las temporadas.');
    return [{ id: option.id.toLowerCase(), title }];
  });
  if (new Set(seasons.map(s => s.id)).size !== seasons.length || new Set(seasons.map(s => s.title)).size !== seasons.length) throw new Error('Disney+ mostró temporadas duplicadas.');
  return seasons;
}
export interface DisneyEpisodeRow extends EpisodeRow { seasonNumber: number }
export function readEpisodes(panel: HTMLElement, url: string): DisneyEpisodeRow[] {
  const rows = Array.from(panel.querySelectorAll<HTMLAnchorElement>(selectors.episode)).map(element => {
    const link = new URL(element.getAttribute('href') ?? '', url);
    const id = isDisneyPlus(link.href) ? watchId(link.href) : undefined;
    const label = normalize(element.getAttribute('aria-label')).match(/^Temporada (\d+) Episodio (\d+)\b/i);
    const heading = normalize(element.querySelector('[data-testid="standard-regular-list-item-title"]')?.textContent).match(/^(\d+)\.\s+(.+)$/);
    if (!id || element.getAttribute('data-item-id')?.toLowerCase() !== id || !label || !heading || Number(label[2]) !== Number(heading[1]) || Number(label[1]) < 1 || Number(label[2]) < 1 || element.getAttribute('aria-disabled') === 'true') throw new Error('Disney+ cambió el formato de los episodios. No se realizó el sorteo.');
    const duration = normalize(element.querySelector('[data-testid="standard-regular-list-metadata"]')?.textContent).match(/(\d+)\s*minutos?(?:,\s*(\d+)\s*s\b)?/i);
    const seconds = duration ? Number(duration[1]) * 60 + Number(duration[2] ?? 0) : undefined;
    return { element, seasonNumber: Number(label[1]), episode: { id, title: heading[2]!, number: Number(label[2]), url: link.href, ...(seconds && Number(duration![2] ?? 0) < 60 ? { duration: seconds } : {}) } };
  });
  if (new Set(rows.map(r => r.episode.id)).size !== rows.length || new Set(rows.map(r => r.episode.number)).size !== rows.length) throw new Error('Disney+ mostró episodios duplicados.');
  return rows;
}

export class DisneyPlusAdapter implements StreamingAdapter {
  readonly context: ReturnType<typeof readSeries>;
  readonly doc: Document;
  readonly url: () => string;
  constructor(doc: Document, url: () => string) { this.doc = doc; this.url = url; this.context = readSeries(doc, url()); }
  assertCurrent() {
    const now = readSeries(this.doc, this.url());
    if (now.series.id !== this.context.series.id || now.series.title !== this.context.series.title || now.root !== this.context.root || now.section !== this.context.section) throw new Error('Cambiaste de serie. Volvé a abrir la extensión.');
  }
  async seasons(signal: AbortSignal): Promise<Season[]> {
    signal.throwIfAborted(); this.assertCurrent();
    const panel = this.context.section;
    const toggle = panel.querySelector<HTMLElement>(selectors.toggle);
    if (!toggle) return waitFor(() => {
      this.assertCurrent();
      const set = panel.querySelector<HTMLElement>(selectors.set);
      const rows = readEpisodes(panel, this.url());
      if (!set || !rows.length) return;
      if (!new RegExp(`^${uuid}$`, 'i').test(set.dataset.setId ?? '')) throw new Error('Disney+ cambió el formato de las temporadas.');
      if (new Set(rows.map(r => r.seasonNumber)).size !== 1) throw new Error('No pude identificar una única temporada en Disney+.');
      return [{ id: set.dataset.setId!.toLowerCase(), title: `Temporada ${rows[0]!.seasonNumber}` }];
    }, signal);
    if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
    return waitFor(() => {
      this.assertCurrent();
      const seasons = readSeasons(panel);
      const announced = normalize(this.context.root.querySelector('[data-testid="masthead-metadata"]')?.textContent).match(/\b(\d+) temporadas?\b/i);
      return seasons.length && (!announced || seasons.length === Number(announced[1])) ? seasons : undefined;
    }, signal);
  }
  async episodes(season: Season, signal: AbortSignal): Promise<EpisodeRow[]> {
    signal.throwIfAborted(); this.assertCurrent();
    const panel = this.context.section;
    const toggle = panel.querySelector<HTMLElement>(selectors.toggle);
    if (toggle) {
      if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
      const option = await waitFor(() => {
        this.assertCurrent();
        return Array.from(panel.querySelectorAll<HTMLElement>(selectors.option)).find(o => o.id.toLowerCase() === season.id && normalize(o.getAttribute('title') ?? o.textContent) === season.title);
      }, signal);
      signal.throwIfAborted(); option.click();
    }
    const number = Number(season.title.match(/^Temporada (\d+)$/)?.[1]);
    let selected = false, signature = '', stableSince = Date.now(), scrollAt = 0, scrollToEnd = true;
    // Disney+ publishes no total. Traverse its pagination marker and require three
    // seconds without growth or an exposed loading state; exceptionally late pages
    // may still be missed. This explicitly approved heuristic is bounded/cancelable.
    return waitFor(() => {
      this.assertCurrent();
      if (toggle && normalize(toggle.textContent) !== season.title) {
        if (selected) throw new Error('Cambiaste de temporada durante el sorteo.');
        return;
      }
      const set = panel.querySelector<HTMLElement>(selectors.set);
      if (!set || set.dataset.setId?.toLowerCase() !== season.id) return;
      selected = true;
      const rows = readEpisodes(set, this.url());
      if (!rows.length || rows.some(r => r.seasonNumber !== number)) { stableSince = Date.now(); return; }
      const nextSignature = rows.map(r => r.episode.id).join(',');
      if (signature && !signature.split(',').every(id => rows.some(r => r.episode.id === id))) throw new Error('Disney+ reemplazó la lista durante la carga. Volvé a intentarlo.');
      // Episode progress bars describe viewing history, not pending pagination.
      if (signature !== nextSignature || panel.matches('[aria-busy="true"]') || panel.querySelector('[aria-busy="true"]')) { signature = nextSignature; stableSince = Date.now(); }
      if (Date.now() - scrollAt >= 500) {
        const end = set.querySelector<HTMLElement>(selectors.spy) ?? rows.at(-1)!.element;
        // Re-enter the marker's viewport to give the site's lazy loader another chance.
        (scrollToEnd ? end : set).scrollIntoView({ block: scrollToEnd ? 'center' : 'start', behavior: 'instant' });
        scrollToEnd = !scrollToEnd; scrollAt = Date.now();
        return; // Re-read after the site has handled the scroll, even at the deadline.
      }
      return Date.now() - stableSince >= 3000 ? rows : undefined;
    }, signal, 60000);
  }
}
