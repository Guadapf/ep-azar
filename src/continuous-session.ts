import { pickNext, type Catalog } from './catalog.ts';
import { providerFor } from './providers.ts';
import type { Selection } from './types.ts';

export interface ContinuousSession {
  id: string;
  generation: number;
  catalog: Catalog;
  current: Selection;
  next: Selection;
  endUntil?: number;
  error?: string;
}
export type ContinuousView = Omit<ContinuousSession, 'catalog'>;
export function view(session: ContinuousSession): ContinuousView {
  const { catalog: _, ...result } = session;
  return result;
}
export interface SessionPorts {
  get(tab: number): Promise<ContinuousSession | undefined>;
  put(tab: number, session: ContinuousSession): Promise<void>;
  remove(tab: number): Promise<void>;
  url(tab: number): Promise<string>;
  navigate(tab: number, url: string): Promise<void>;
}

// All mutations are serialized per tab, including navigation events and double clicks.
export class Sessions {
  private jobs = new Map<number, Promise<unknown>>();
  readonly ports: SessionPorts;
  readonly random: () => number;
  readonly now: () => number;
  constructor(ports: SessionPorts, random = Math.random, now = Date.now) { this.ports = ports; this.random = random; this.now = now; }
  serial<T>(tab: number, job: () => Promise<T>): Promise<T> {
    const result = (this.jobs.get(tab) ?? Promise.resolve()).catch(() => {}).then(job);
    this.jobs.set(tab, result);
    void result.finally(() => { if (this.jobs.get(tab) === result) this.jobs.delete(tab); }).catch(() => {});
    return result;
  }
  matches(session: ContinuousSession, url: string): boolean {
    const provider = providerFor(url);
    return !!provider && provider.id === providerFor(session.current.episode.url)?.id && provider.watchId(url) === session.current.episode.id;
  }
  async create(tab: number, catalog: Catalog): Promise<ContinuousView> {
    const url = await this.ports.url(tab);
    const provider = providerFor(url);
    if (!provider || provider.watchId(url) || provider.seriesId(url) !== catalog.series.id) throw new Error('La ficha cambió durante la preparación.');
    if (!catalog.seasons.length || catalog.seasons.some(entry => !entry.episodes.length || entry.episodes.some(ep => providerFor(ep.url)?.id !== provider.id || provider.watchId(ep.url) !== ep.id))) throw new Error('El catálogo contiene episodios inválidos.');
    const existing = await this.ports.get(tab);
    if (existing) return view(existing);
    const session: ContinuousSession = {
      id: crypto.randomUUID(), generation: 0, catalog,
      current: pickNext(catalog, this.random), next: pickNext(catalog, this.random)
    };
    await this.ports.put(tab, session);
    await this.navigate(tab, session);
    return view(session);
  }
  private async navigate(tab: number, session: ContinuousSession) {
    try { await this.ports.navigate(tab, session.current.episode.url); }
    catch {
      session.error = 'No pude abrir el episodio. Desactivá el modo y volvé a iniciarlo desde la ficha.';
      await this.ports.put(tab, session);
    }
  }
  async command(tab: number, type: 'get' | 'stop' | 'reroll' | 'ended' | 'arm' | 'disarm', token?: { id: string; generation: number }, remaining = 0): Promise<ContinuousView | undefined> {
    const session = await this.ports.get(tab);
    if (!session) return;
    if (token && (session.id !== token.id || session.generation !== token.generation)) return view(session);
    if (type === 'stop') { await this.ports.remove(tab); return; }
    const url = await this.ports.url(tab);
    if (!this.matches(session, url)) return session.error ? view(session) : undefined;
    if (type === 'reroll') session.next = pickNext(session.catalog, this.random);
    if (type === 'arm') session.endUntil = this.now() + (Math.max(0, Math.min(remaining, 120)) + 20) * 1000;
    if (type === 'disarm') delete session.endUntil;
    if (type === 'ended' && !session.error) return this.advance(tab, session);
    if (type !== 'get') await this.ports.put(tab, session);
    return view(session);
  }
  private async advance(tab: number, session: ContinuousSession): Promise<ContinuousView> {
    session.current = session.next;
    session.next = pickNext(session.catalog, this.random);
    session.generation++;
    delete session.endUntil;
    await this.ports.put(tab, session);
    await this.navigate(tab, session);
    return view(session);
  }
  async changed(tab: number, url: string): Promise<ContinuousView | undefined> {
    const session = await this.ports.get(tab);
    if (!session) return;
    if (this.matches(session, url)) return view(session);
    // Some players navigate during the credits before dispatching `ended`.
    const provider = providerFor(url);
    const watch = provider?.watchId(url);
    const knownEpisode = provider?.id === providerFor(session.current.episode.url)?.id && session.catalog.seasons.some(s => s.episodes.some(e => e.id === watch));
    if (!session.error && knownEpisode && session.endUntil && this.now() <= session.endUntil) return this.advance(tab, session);
    await this.ports.remove(tab);
  }
}
