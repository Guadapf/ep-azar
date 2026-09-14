import { providerFor } from './providers.ts';
import type { Provider } from './providers.ts';
import { waitFor } from './wait.ts';
import { pick } from './random.ts';
import type { Selection, Status, StreamingAdapter } from './types.ts';

export class Controller {
  private state: Status = { phase: 'idle', message: 'Abrí la ficha de una serie.' };
  private abort?: AbortController;
  private busy = false;
  private hasEnteredPlayer = false;
  private selectedElement?: HTMLElement;
  private adapter?: StreamingAdapter;
  private provider?: Provider;
  readonly doc: Document;
  readonly url: () => string;
  readonly navigate: (url: string) => void;
  readonly random: () => number;

  constructor(doc: Document, url: () => string, navigate: (url: string) => void, random = Math.random) {
    this.doc = doc; this.url = url; this.navigate = navigate; this.random = random;
  }

  status(): Status {
    const provider = providerFor(this.url());
    const currentWatch = provider?.watchId(this.url());
    const selection = this.state.selection;
    if (selection && provider?.id === this.provider?.id && currentWatch === selection.episode.id) {
      this.hasEnteredPlayer = true;
      return this.state;
    }
    if (this.busy) return this.state;
    try {
      if (!provider) throw new Error('Abrí una serie en Netflix o HBO Max.');
      const { series } = provider.readSeries(this.doc, this.url());
      if (this.hasEnteredPlayer || this.state.series?.id !== series.id || this.state.series?.title !== series.title) {
        this.state = { phase: 'idle', series, message: 'Primero una temporada. Después, un episodio.' };
        this.selectedElement = undefined;
        this.hasEnteredPlayer = false;
      }
    } catch (error) {
      this.state = { phase: 'error', message: currentWatch ? 'Abrí la ficha de una serie para hacer otro sorteo.' : message(error) };
      this.selectedElement = undefined;
    }
    return this.state;
  }

  start(expectedSeriesId?: string): Status {
    if (this.busy) return this.state;
    try {
      const provider = providerFor(this.url());
      if (!provider) throw new Error('Abrí una serie en Netflix o HBO Max.');
      this.provider = provider;
      this.adapter = provider.create(this.doc, this.url);
      if (!expectedSeriesId || this.adapter.context.series.id !== expectedSeriesId) throw new Error('La serie cambió. Revisá la ficha y volvé a sortear.');
      this.abort = new AbortController();
      this.busy = true;
      this.hasEnteredPlayer = false;
      this.selectedElement = undefined;
      this.state = { phase: 'loading', series: this.adapter.context.series, message: 'Leyendo las temporadas…' };
      // This promise lives in the content script, never in the popup.
      void this.run(this.adapter, provider, this.abort.signal);
    } catch (error) { this.state = { phase: 'error', message: message(error) }; }
    return this.state;
  }

  private async run(adapter: StreamingAdapter, provider: Provider, signal: AbortSignal): Promise<void> {
    let monitor: ReturnType<typeof setInterval> | undefined;
    try {
      const season = pick(await adapter.seasons(signal), this.random);
      this.state.message = `Cargando ${season.title}…`;
      const row = pick(await adapter.episodes(season, signal), this.random);
      adapter.assertCurrent();
      signal.throwIfAborted();
      const selection: Selection = { series: adapter.context.series, season, episode: row.episode };
      this.selectedElement = row.element;
      this.state = { phase: 'opening', series: selection.series, selection, message: `Abriendo el episodio en ${provider.name}…` };
      row.element.click();
      const isSelectedPlayer = () => providerFor(this.url())?.id === provider.id && provider.watchId(this.url()) === selection.episode.id;
      monitor = setInterval(() => {
        if (isSelectedPlayer()) {
          this.hasEnteredPlayer = true;
          return;
        }
        const id = provider.watchId(this.url());
        const isSource = provider.seriesId(this.url()) === selection.series.id;
        if (this.hasEnteredPlayer || providerFor(this.url())?.id !== provider.id || (id && id !== selection.episode.id) || (!id && !isSource)) this.abort?.abort(new Error('La página cambió durante el sorteo.'));
      }, 100);
      await waitFor(() => {
        if (!isSelectedPlayer()) return;
        this.hasEnteredPlayer = true;
        return true;
      }, signal, 12000);
      this.state.message = 'Episodio abierto. Comprobando la reproducción…';
      let lastTime: number | undefined;
      await waitFor(() => {
        if (!isSelectedPlayer()) return;
        const video = this.doc.querySelector('video');
        if (!video || video.paused || video.readyState < 2) return;
        const advancing = lastTime !== undefined && video.currentTime > lastTime;
        lastTime = video.currentTime;
        return advancing || undefined;
      }, signal, 20000);
      this.state = { ...this.state, phase: 'playing', message: 'Tu episodio se está reproduciendo.' };
    } catch (error) {
      if (this.state.selection && !signal.aborted) {
        this.state = { ...this.state, phase: 'fallback', message: `No pude confirmar la reproducción. Podés abrir el episodio elegido o usar los controles de ${provider.name}.` };
      } else {
        this.state = { phase: 'error', message: message(error) };
      }
    } finally {
      if (monitor) clearInterval(monitor);
      this.busy = false;
    }
  }

  open(): Status {
    if (this.busy) return this.state;
    const state = this.status();
    if (!state.selection) return state;
    const selection = state.selection;
    if (this.provider?.watchId(this.url()) === selection.episode.id) {
      this.navigate(selection.episode.url);
    } else {
      try {
        this.adapter?.assertCurrent();
        if (!this.selectedElement?.isConnected) throw new Error('La ficha cambió. Volvé a sortear.');
        this.selectedElement.click();
      } catch (error) { this.state = { phase: 'error', message: message(error) }; }
    }
    return this.state;
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar el sorteo. Volvé a intentarlo.';
}
