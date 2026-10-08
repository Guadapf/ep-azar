import type { ContinuousView } from './continuous-session.ts';
import { providerFor } from './providers.ts';
import { playbackVideo, disneyTimeline } from './playback.ts';

export type PlaybackAction = 'ended' | 'arm' | 'disarm' | 'stop';

// Capture media events once, including videos the site's SPA creates later.
// No DOM scan on every frame and no messages until playback reaches the credits.
export class ContinuousPlayer {
  private session?: ContinuousView;
  private armed = false;
  private finished = false;
  private lastTime?: number;
  private video?: HTMLVideoElement;
  private timeline?: Element;
  playing = false;
  readonly doc: Document;
  readonly url: () => string;
  readonly send: (action: PlaybackAction, session: ContinuousView, remaining?: number) => void;
  constructor(doc: Document, url: () => string, send: (action: PlaybackAction, session: ContinuousView, remaining?: number) => void) {
    this.doc = doc; this.url = url; this.send = send;
    for (const name of ['timeupdate', 'ended', 'pause', 'seeking', 'emptied']) doc.addEventListener(name, this.media, true);
    doc.addEventListener('click', this.click, true);
    doc.defaultView?.addEventListener('popstate', this.back);
  }
  set(session?: ContinuousView) {
    if (session?.id !== this.session?.id || session?.generation !== this.session?.generation) {
      this.armed = false; this.finished = false; this.lastTime = undefined; this.video = undefined; this.timeline = undefined; this.playing = false;
    }
    this.session = session;
  }
  private media = (event: Event) => {
    const session = this.session;
    const video = event.target as HTMLVideoElement | null;
    if (!session || session.error || !video || video.tagName !== 'VIDEO' || !video.isConnected || this.finished) return;
    const provider = providerFor(this.url());
    if (provider?.id !== providerFor(session.current.episode.url)?.id || provider?.watchId(this.url()) !== session.current.episode.id) return;
    // Only act on a single ready video in the selected episode's player.
    if (playbackVideo(this.doc, this.url()) !== video) return;
    if (this.video !== video) {
      this.video = video; this.lastTime = undefined;
      this.timeline = provider.id === 'disneyplus' ? disneyTimeline(this.doc) : undefined;
    }
    if (event.type === 'pause' || event.type === 'seeking' || event.type === 'emptied') {
      this.playing = false;
      this.lastTime = undefined;
      if (this.armed) { this.armed = false; this.send('disarm', session); }
      return;
    }
    if (event.type === 'ended' && video.ended) {
      this.finished = true;
      this.send('ended', session);
      return;
    }
    const timelineDuration = this.timeline?.isConnected ? Number(this.timeline.getAttribute('aria-valuemax')) : 0;
    const duration = Number.isFinite(video.duration) ? video.duration : provider.id === 'disneyplus' ? timelineDuration > 0 ? timelineDuration : session.current.episode.duration : undefined;
    if (!duration || !Number.isFinite(duration) || duration <= 0) return;
    if (event.type !== 'timeupdate' || video.paused || video.seeking || video.readyState < 2) return;
    this.playing = this.lastTime !== undefined && video.currentTime > this.lastTime;
    this.lastTime = video.currentTime;
    const remaining = duration - video.currentTime;
    if (this.playing && !this.armed && remaining >= 0 && remaining <= Math.min(120, duration * .1)) {
      this.armed = true;
      this.send('arm', session, remaining / Math.max(.25, video.playbackRate));
    }
  };
  private click = (event: Event) => {
    if (!this.session || !event.isTrusted) return;
    const control = event.composedPath().find(target => (target as Element).matches?.('a,button,[role="button"]')) as Element | undefined;
    if (!control) return;
    const label = (control.getAttribute('aria-label') ?? control.textContent ?? '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim();
    // Explicit navigation wins over the credits handoff; pausing/volume do not stop it.
    if (control.tagName === 'A' || /^(volver\b|ver pr[oó]ximo\b|salir de la reproducci[oó]n|episodio siguiente|siguiente episodio|temporada \d+, episodio \d+)/i.test(label)) {
      this.send('stop', this.session);
      this.set(undefined);
    }
  };
  private back = () => {
    if (this.session) this.send('stop', this.session);
    this.set(undefined);
  };
  dispose() {
    for (const name of ['timeupdate', 'ended', 'pause', 'seeking', 'emptied']) this.doc.removeEventListener(name, this.media, true);
    this.doc.removeEventListener('click', this.click, true);
    this.doc.defaultView?.removeEventListener('popstate', this.back);
  }
}
