import { readCatalog, type Catalog } from './catalog.ts';
import { Controller } from './controller.ts';
import type { ContinuousView } from './continuous-session.ts';
import { ContinuousPlayer } from './continuous-player.ts';
import { providerFor } from './providers.ts';
import type { Command, Status } from './types.ts';

type Request = { type: 'create'; catalog: Catalog } | { type: 'get' | 'stop' | 'reroll' | 'ended' | 'arm' | 'disarm'; token?: { id: string; generation: number }; remaining?: number };
export type SessionTransport = (request: Request) => Promise<ContinuousView | undefined>;

export class ExtensionController {
  private current?: ContinuousView;
  private preparation?: AbortController;
  private preparationStatus?: Status;
  private failure?: string;
  private player: ContinuousPlayer;
  private requestId = 0;
  private departing = false;
  readonly single: Controller;
  readonly transport: SessionTransport;
  constructor(single: Controller, transport: SessionTransport) {
    this.single = single; this.transport = transport;
    this.player = new ContinuousPlayer(single.doc, single.url, (type, session, remaining) => {
      if (type === 'ended') this.departing = true;
      void this.update({ type, token: session, remaining }).catch(error => { this.failure = errorMessage(error); });
    });
  }
  private async update(request: Request) {
    const id = ++this.requestId;
    const session = await this.transport(request);
    if (id === this.requestId) {
      this.current = session;
      // An ended video in the old document must not be rebound to a repeated episode.
      if (!session) this.departing = false;
      this.player.set(this.departing ? undefined : session);
    }
    return session;
  }
  async refresh() { await this.update({ type: 'get' }); }
  private status(): Status {
    if (this.preparationStatus) return this.preparationStatus;
    if (this.current) return {
      phase: this.current.error || this.failure ? 'error' : this.player.playing ? 'playing' : 'idle',
      message: this.current.error ?? this.failure ?? 'Modo continuo activo. El próximo episodio se abrirá al terminar. Si está pausado, usá Reproducir en el sitio.',
      series: this.current.current.series, selection: this.current.current,
      continuous: true, next: this.current.next
    };
    const result = this.single.status();
    if (this.failure) return { ...result, phase: 'error', message: this.failure };
    return result;
  }
  async command(request: Command): Promise<Status> {
    if (request.type === 'stop-continuous') {
      this.preparation?.abort(new Error('Preparación cancelada.'));
      await this.update({ type: 'stop' });
      this.failure = undefined;
      return this.status();
    }
    if (request.type === 'status') { if (!this.preparation) await this.refresh(); return this.status(); }
    if (this.preparation) return this.status();
    if (request.type === 'reroll') {
      if (this.current) await this.update({ type: 'reroll', token: this.current });
      return this.status();
    }
    if (this.current) return this.status();
    const singleStatus = this.single.status();
    if (singleStatus.phase === 'loading' || singleStatus.phase === 'opening') return singleStatus;
    this.failure = undefined;
    if (request.type === 'start-continuous') {
      const abort = new AbortController();
      this.preparation = abort;
      this.preparationStatus = { phase: 'loading', series: singleStatus.series, continuous: true, message: 'Preparando el catálogo completo…' };
      void this.prepare(request.seriesId, abort);
      return this.status();
    }
    if (request.type === 'start') return this.single.start(request.seriesId);
    if (request.type === 'open') return this.single.open();
    return this.status();
  }
  private async prepare(expected: string | undefined, abort: AbortController) {
    try {
      const provider = providerFor(this.single.url());
      if (!provider) throw new Error('Abrí la ficha de una serie.');
      const adapter = provider.create(this.single.doc, this.single.url);
      if (adapter.context.series.id !== expected) throw new Error('La serie cambió. Volvé a abrir la extensión.');
      const catalog = await readCatalog(adapter, abort.signal, message => { this.preparationStatus!.message = message; });
      adapter.assertCurrent();
      abort.signal.throwIfAborted();
      await this.update({ type: 'create', catalog });
      if (abort.signal.aborted) await this.update({ type: 'stop' });
    } catch (error) {
      if (!abort.signal.aborted) this.failure = errorMessage(error);
    } finally { this.preparation = undefined; this.preparationStatus = undefined; }
  }
  dispose() { this.preparation?.abort(); this.player.dispose(); }
}
function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'No se pudo completar la operación.'; }
