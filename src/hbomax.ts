import type { EpisodeRow, Season, StreamingAdapter } from './types.ts';
import { waitFor } from './wait.ts';

// Accessible labels contain Unicode directional isolates around translated fields.
export const normalize = (text: string | null | undefined) => (text ?? '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim();
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export const selectors = {
  panel: '[role="tabpanel"][aria-label="Episodios"]',
  toggle: '[data-dropdown="tabbedContentDropdown"] button[aria-haspopup="true"]',
  option: '[role="listbox"] [role="option"]',
  episode: 'a[href*="/video/watch/"]'
};
export function isHboMax(url: string): boolean {
  const parsed = new URL(url);
  return parsed.protocol === 'https:' && parsed.hostname === 'play.hbomax.com';
}
export function seriesId(url: string): string | undefined {
  return new URL(url).pathname.match(new RegExp(`^/show/(${uuid})/?$`, 'i'))?.[1]?.toLowerCase();
}
export function watchId(url: string): string | undefined {
  return new URL(url).pathname.match(new RegExp(`^/video/watch/(${uuid})/?$`, 'i'))?.[1]?.toLowerCase();
}
export function readSeries(doc: Document, url: string) {
  if (!isHboMax(url)) throw new Error('Abrí HBO Max y la ficha de una serie.');
  const id = seriesId(url);
  const root = doc.querySelector<HTMLElement>('main[aria-label]');
  const section = root?.querySelector<HTMLElement>(selectors.panel);
  if (!id || !root || !section) throw new Error('Iniciá sesión en HBO Max y abrí la pestaña «Episodios» de una serie.');
  const title = normalize(root.querySelector('[role="heading"][aria-level="1"]')?.getAttribute('aria-label'));
  if (!title || title.toLocaleLowerCase('es') !== normalize(root.getAttribute('aria-label')).toLocaleLowerCase('es')) throw new Error('La ficha está cargando. Esperá y volvé a abrir la extensión.');
  const canonical = doc.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.getAttribute('href');
  if (canonical && seriesId(new URL(canonical, url).href) !== id) throw new Error('La ficha está cambiando. Esperá a que termine de cargar.');
  return { series: { id, title }, root, section };
}

export function readSeasons(panel: HTMLElement): Season[] {
  const result = Array.from(panel.querySelectorAll<HTMLElement>(selectors.option)).flatMap(option => {
    const title = normalize(option.getAttribute('aria-label') ?? option.textContent);
    const number = title.match(/^Temporada (\d+)$/)?.[1];
    if (!number || option.getAttribute('aria-disabled') === 'true') return [];
    return [{ id: number, title }];
  });
  if (new Set(result.map(s => s.id)).size !== result.length) throw new Error('HBO Max mostró temporadas duplicadas. Volvé a abrir la ficha.');
  return result;
}

export interface HboEpisodeRow extends EpisodeRow { season: string; position: number; total: number }
export function readEpisodes(panel: HTMLElement, url: string): HboEpisodeRow[] {
  return Array.from(panel.querySelectorAll<HTMLAnchorElement>(selectors.episode)).map(element => {
    const link = new URL(element.getAttribute('href')!, url);
    const id = isHboMax(link.href) ? watchId(link.href) : undefined;
    const text = normalize(element.getAttribute('aria-label'));
    const match = text.match(/Temporada (\d+), Episodio (\d+): (.+?)\. (\d+) de (\d+)\./i);
    const sonic = element.getAttribute('data-sonic-id');
    if (!id || !match || (sonic && sonic.toLowerCase() !== id)) throw new Error('HBO Max cambió el formato de los episodios. No se realizó el sorteo.');
    const [, season, number, title, position, total] = match;
    if (Number(number) < 1 || Number(position) < 1 || Number(total) < Number(position)) throw new Error('HBO Max mostró una numeración de episodios inválida.');
    return {
      element, season: season!, position: Number(position), total: Number(total),
      // Keep the exact site-provided URL, including pos=0 when HBO Max chose "Ver de nuevo".
      episode: { id, title: title!, number: Number(number), url: link.href }
    };
  });
}

export class HboMaxAdapter implements StreamingAdapter {
  readonly context: ReturnType<typeof readSeries>;
  readonly doc: Document;
  readonly url: () => string;
  constructor(doc: Document, url: () => string) { this.doc = doc; this.url = url; this.context = readSeries(doc, url()); }
  assertCurrent(): void {
    const now = readSeries(this.doc, this.url());
    if (now.series.id !== this.context.series.id || now.series.title !== this.context.series.title || now.root !== this.context.root || now.section !== this.context.section) {
      throw new Error('Cambiaste de serie. Volvé a abrir la extensión.');
    }
  }
  async seasons(signal: AbortSignal): Promise<Season[]> {
    this.assertCurrent();
    const panel = this.context.section;
    const toggle = panel.querySelector<HTMLElement>(selectors.toggle);
    if (!toggle) {
      const rows = await waitFor(() => {
        this.assertCurrent();
        const rows = readEpisodes(panel, this.url());
        return rows.length ? rows : undefined;
      }, signal);
      const ids = new Set(rows.map(r => r.season));
      if (ids.size !== 1) throw new Error('No pude identificar una única temporada en HBO Max.');
      return [{ id: rows[0]!.season, title: `Temporada ${rows[0]!.season}` }];
    }
    if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
    return waitFor(() => {
      this.assertCurrent();
      const seasons = readSeasons(panel);
      return seasons.length ? seasons : undefined;
    }, signal);
  }
  async episodes(season: Season, signal: AbortSignal): Promise<EpisodeRow[]> {
    this.assertCurrent();
    const panel = this.context.section;
    const toggle = panel.querySelector<HTMLElement>(selectors.toggle);
    if (toggle) {
      if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
      const option = await waitFor(() => {
        this.assertCurrent();
        return Array.from(panel.querySelectorAll<HTMLElement>(selectors.option)).find(o => normalize(o.getAttribute('aria-label') ?? o.textContent) === season.title);
      }, signal);
      option.click();
    }
    let selected = false;
    return waitFor(() => {
      this.assertCurrent();
      const currentLabel = normalize(panel.querySelector(selectors.toggle)?.textContent);
      if (toggle && currentLabel !== season.title) {
        if (selected) throw new Error('Cambiaste de temporada durante el sorteo. Volvé a intentarlo.');
        return;
      }
      selected = true;
      const rows = readEpisodes(panel, this.url());
      // Changing the dropdown can leave the old season's links in place briefly.
      if (!rows.length || rows.some(r => r.season !== season.id)) return;
      const total = rows[0]!.total;
      if (rows.some(r => r.total !== total)) throw new Error('HBO Max mostró cantidades de episodios inconsistentes.');
      if (new Set(rows.map(r => r.episode.id)).size !== rows.length || new Set(rows.map(r => r.position)).size !== rows.length) throw new Error('HBO Max mostró episodios duplicados.');
      // Even offscreen cards expose links. Never choose from a partial carousel.
      return rows.length === total ? rows : undefined;
    }, signal);
  }
}
