export interface Series { id: string; title: string }
export interface Season { id: string; title: string; episodeCount?: number }
export interface Episode { id: string; title: string; number: number; url: string; duration?: number }
export interface Selection { series: Series; season: Season; episode: Episode }
export interface EpisodeRow { episode: Episode; element: HTMLElement }
export interface StreamingAdapter {
  readonly context: { series: Series; root: HTMLElement; section: HTMLElement };
  assertCurrent(): void;
  seasons(signal: AbortSignal): Promise<Season[]>;
  episodes(season: Season, signal: AbortSignal): Promise<EpisodeRow[]>;
}
export interface Status {
  phase: 'idle' | 'loading' | 'opening' | 'playing' | 'fallback' | 'error';
  message: string;
  series?: Series;
  selection?: Selection;
  continuous?: boolean;
  next?: Selection;
}
export interface Command { channel: 'streaming-random-v2'; type: 'status' | 'start' | 'open' | 'start-continuous' | 'stop-continuous' | 'reroll'; seriesId?: string }
