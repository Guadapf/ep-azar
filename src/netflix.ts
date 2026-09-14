import type { Episode, Season, Series } from './types.ts';
import { waitFor } from './wait.ts';

const normalize = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
export const selectors = {
  dialog: '[data-uia="modal-motion-container-DETAIL_MODAL"]',
  section: '[data-uia="episode-selector"]',
  toggle: '[data-uia="dropdown-toggle"]',
  option: '[data-uia="dropdown-menu-item"][role="menuitem"]',
  episode: '.episode-item[role="button"]',
  expand: '[data-uia="section-expand"]'
};

export function seriesId(url: string): string | undefined {
  const parsed = new URL(url);
  const id = parsed.searchParams.get('jbv') ?? parsed.pathname.match(/^\/title\/(\d+)/)?.[1];
  return id && /^\d+$/.test(id) ? id : undefined;
}
export function watchId(url: string): string | undefined {
  return new URL(url).pathname.match(/^\/watch\/(\d+)(?:\/|$)/)?.[1];
}
export function isNetflix(url: string): boolean {
  const parsed = new URL(url);
  return parsed.protocol === 'https:' && parsed.hostname === 'www.netflix.com';
}

export function readSeries(doc: Document, url: string): { series: Series; root: HTMLElement; section: HTMLElement } {
  if (!isNetflix(url)) throw new Error('Abrí Netflix y la ficha de una serie.');
  if (new URL(url).pathname.startsWith('/login')) throw new Error('Iniciá sesión en Netflix y abrí una serie.');
  const root = doc.querySelector<HTMLElement>(selectors.dialog);
  const id = seriesId(url);
  if (!root || !id) throw new Error('Abrí «Más info» de una serie en Netflix.');
  const section = root.querySelector<HTMLElement>(selectors.section);
  if (!section) throw new Error('La ficha no muestra episodios. Elegí una serie o esperá a que termine de cargar.');
  const title = normalize(Array.from(root.querySelectorAll('h3')).find(h => normalize(h.textContent).startsWith('Acerca de '))?.querySelector('strong')?.textContent);
  if (!title) throw new Error('No se pudo identificar la serie. Volvé a abrir su ficha.');
  const playLink = root.querySelector<HTMLAnchorElement>('a[href*="/watch/"]');
  const context = playLink ? new URL(playLink.getAttribute('href')!, url).searchParams.get('tctx') : undefined;
  const linkedSeriesId = context?.match(/(?:^|,)Video:(\d+)(?:,|$)/)?.[1];
  if (linkedSeriesId && linkedSeriesId !== id) throw new Error('La ficha está cambiando. Esperá a que termine de cargar y volvé a abrir la extensión.');
  return { series: { id, title }, root, section };
}

export function readSeasons(section: HTMLElement): Season[] {
  return Array.from(section.querySelectorAll<HTMLElement>(selectors.option)).flatMap(el => {
    const text = normalize(el.textContent);
    const count = text.match(/\((\d+) episodios?\)/i);
    const id = el.dataset.index;
    // The menu also contains "Ver todos los episodios", which is not a season.
    if (!count || Number(count[1]) < 1 || id === undefined || el.getAttribute('aria-disabled') === 'true') return [];
    return [{ id, title: text.replace(/\s*\(\d+ episodios?\)/i, '').trim(), episodeCount: Number(count[1]) }];
  });
}

export function readEpisodes(section: HTMLElement): Array<{ episode: Episode; element: HTMLElement }> {
  return Array.from(section.querySelectorAll<HTMLElement>(selectors.episode)).map(element => {
    let id: string | undefined;
    for (const node of element.querySelectorAll('[data-ui-tracking-context]')) {
      try {
        const data = JSON.parse(decodeURIComponent(node.getAttribute('data-ui-tracking-context') ?? ''));
        if (/^\d+$/.test(String(data.video_id))) { id = String(data.video_id); break; }
      } catch { /* An unrelated tracking attribute is not episode metadata. */ }
    }
    const title = normalize(element.getAttribute('aria-label'));
    const number = Number(normalize(element.querySelector('.titleCard-title_index')?.textContent));
    if (!id || !title || !Number.isInteger(number) || number < 1) {
      throw new Error('Netflix cambió el formato de los episodios. No se realizó el sorteo.');
    }
    return { episode: { id, title, number, url: `https://www.netflix.com/watch/${id}` }, element };
  });
}

export class NetflixAdapter {
  readonly doc: Document;
  readonly url: () => string;
  readonly context: ReturnType<typeof readSeries>;
  constructor(doc: Document, url: () => string) {
    this.doc = doc;
    this.url = url;
    this.context = readSeries(doc, url());
  }
  assertCurrent(): void {
    const now = readSeries(this.doc, this.url());
    if (now.series.id !== this.context.series.id || now.series.title !== this.context.series.title || now.root !== this.context.root || now.section !== this.context.section) {
      throw new Error('Cambiaste de serie. Abrí la extensión de nuevo para sortear en la ficha actual.');
    }
  }
  async seasons(signal: AbortSignal): Promise<Season[]> {
    this.assertCurrent();
    const section = this.context.section;
    const toggle = section.querySelector<HTMLElement>(selectors.toggle);
    if (!toggle) {
      await waitFor(() => { this.assertCurrent(); return readEpisodes(section).length || undefined; }, signal);
      const metadata = normalize(this.context.root.querySelector('.videoMetadata--line .duration')?.textContent);
      const count = metadata.match(/^(\d+) episodios?$/i);
      if (!count || Number(count[1]) < 1) throw new Error('No pude confirmar el total de episodios. Volvé a abrir la ficha.');
      return [{ id: 'single', title: 'Temporada única', episodeCount: Number(count[1]) }];
    }
    const wasOpen = toggle.getAttribute('aria-expanded') === 'true';
    if (!wasOpen) toggle.click();
    const seasons = await waitFor(() => {
      this.assertCurrent();
      const entries = readSeasons(section);
      return entries.length ? entries : undefined;
    }, signal);
    return seasons;
  }
  async episodes(season: Season, signal: AbortSignal) {
    this.assertCurrent();
    const section = this.context.section;
    const before = readEpisodes(section).map(x => x.episode.id).join(',');
    const toggle = section.querySelector<HTMLElement>(selectors.toggle);
    const changed = toggle && normalize(toggle.textContent) !== season.title;
    if (toggle) {
      if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
      const option = await waitFor(() => {
        this.assertCurrent();
        return Array.from(section.querySelectorAll<HTMLElement>(selectors.option)).find(x => x.dataset.index === season.id);
      }, signal);
      option.click();
    }
    await waitFor(() => {
      this.assertCurrent();
      if (toggle && normalize(section.querySelector(selectors.toggle)?.textContent) !== season.title) return;
      const rows = readEpisodes(section);
      if (!rows.length || (changed && rows.map(x => x.episode.id).join(',') === before)) return;
      return true;
    }, signal);

    let expanded: Element | undefined;
    return waitFor(() => {
      this.assertCurrent();
      if (toggle && normalize(section.querySelector(selectors.toggle)?.textContent) !== season.title) throw new Error('Cambiaste de temporada durante el sorteo. Volvé a intentarlo.');
      const expand = section.querySelector<HTMLElement>(selectors.expand);
      if (expand && expand !== expanded) { expanded = expand; expand.click(); return; }
      const rows = readEpisodes(section);
      if (!rows.length) return;
      if (new Set(rows.map(x => x.episode.id)).size !== rows.length) throw new Error('La lista de episodios contiene duplicados. Volvé a abrir la ficha.');
      return rows.length === season.episodeCount ? rows : undefined;
    }, signal);
  }
}
