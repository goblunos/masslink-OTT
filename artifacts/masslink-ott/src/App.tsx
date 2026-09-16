import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, Play, X, Radio, Globe2, ChevronDown, WifiOff } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { VERIFIED_CHANNELS, type Channel } from '@/data/verified-channels';

const queryClient = new QueryClient();
const PAGE_SIZE = 32;

type HlsInstance = {
  loadSource: (url: string) => void;
  attachMedia: (video: HTMLVideoElement) => void;
  destroy: () => void;
  on: (event: string, callback: (...args: any[]) => void) => void;
};

type HlsConstructor = new (options?: Record<string, unknown>) => HlsInstance & {
  constructor: HlsConstructor;
};

declare global {
  interface Window {
    Hls?: HlsConstructor & { isSupported?: () => boolean; Events?: Record<string, string> };
  }
}

let hlsScriptPromise: Promise<void> | null = null;
function loadHlsScript() {
  if (window.Hls) return Promise.resolve();
  if (hlsScriptPromise) return hlsScriptPromise;
  hlsScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('HLS playback engine unavailable'));
    document.head.appendChild(script);
  });
  return hlsScriptPromise;
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((word) => word[0] || '').join('').toUpperCase();
}

function ChannelCard({
  channel,
  onPlay,
}: {
  channel: Channel;
  onPlay: (channel: Channel) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<HlsInstance | null>(null);
  const [hovered, setHovered] = useState(false);
  const [status, setStatus] = useState<'VERIFIED' | 'CONNECTING' | 'LIVE' | 'UNAVAILABLE'>('VERIFIED');
  const [playing, setPlaying] = useState(false);

  const stop = useCallback(() => {
    const video = videoRef.current;
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    setPlaying(false);
    setStatus('VERIFIED');
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hovered) {
      if (!hovered) stop();
      return undefined;
    }
    let cancelled = false;
    const markPlaying = () => {
      if (!cancelled) {
        setPlaying(true);
        setStatus('LIVE');
      }
    };
    const markUnavailable = () => {
      if (!cancelled) {
        setStatus('UNAVAILABLE');
      }
    };
    const start = async () => {
      setStatus('CONNECTING');
      video.addEventListener('playing', markPlaying, { once: true });
      video.addEventListener('error', markUnavailable, { once: true });
      try {
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = channel.url;
          await video.play();
        } else {
          await loadHlsScript();
          if (!window.Hls || window.Hls.isSupported?.() === false) throw new Error('HLS not supported');
          const hls = new window.Hls({ enableWorker: true, lowLatencyMode: true, maxBufferLength: 12, capLevelToPlayerSize: true });
          hlsRef.current = hls;
          hls.loadSource(channel.url);
          hls.attachMedia(video);
          hls.on(window.Hls.Events?.MANIFEST_PARSED || 'hlsManifestParsed', () => video.play().catch(() => undefined));
          hls.on(window.Hls.Events?.ERROR || 'hlsError', (_event: unknown, data: { fatal?: boolean }) => {
            if (data?.fatal) markUnavailable();
          });
        }
      } catch {
        markUnavailable();
      }
    };
    start();
    return () => {
      cancelled = true;
      video.removeEventListener('playing', markPlaying);
      video.removeEventListener('error', markUnavailable);
      stop();
    };
  }, [channel, hovered, stop]);

  return (
    <article
      className="channel-card"
      data-testid={`card-channel-${channel.id}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <div className={`channel-media ${playing ? 'is-playing' : ''}`}>
        <video ref={videoRef} muted playsInline preload="none" aria-label={`${channel.name} live preview`} />
        <div className="channel-poster">
          {channel.logo ? <img src={channel.logo} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="initials">{initials(channel.name)}</span>}
        </div>
        <div className="media-shade" />
        <span className="live-pill"><i />LIVE</span>
        <span className={`verify-pill ${status.toLowerCase()}`}>{status}</span>
        <button className="card-play" type="button" onClick={() => onPlay(channel)} aria-label={`Play ${channel.name} live`} data-testid={`button-play-${channel.id}`}>
          <span><Play size={18} fill="currentColor" /></span>
        </button>
      </div>
      <div className="channel-meta">
        <strong title={channel.name}>{channel.name}</strong>
        <div><span>{channel.group}</span><span className="country-tag">{channel.country}</span></div>
      </div>
    </article>
  );
}

function Home() {
  const channels = VERIFIED_CHANNELS;
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<Channel | null>(null);
  const [modalStatus, setModalStatus] = useState('CONNECTING');
  const mainVideoRef = useRef<HTMLVideoElement | null>(null);
  const mainHlsRef = useRef<HlsInstance | null>(null);

  const countries = useMemo(() => [...new Set(channels.map((channel) => channel.country).filter(Boolean))].sort(), [channels]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return channels.filter((channel) => {
      const haystack = `${channel.name} ${channel.displayName} ${channel.country} ${channel.group}`.toLowerCase();
      return (!normalized || haystack.includes(normalized)) && (!country || channel.country === country);
    });
  }, [channels, country, query]);
  const visible = filtered.slice(0, visibleCount);

  useEffect(() => {
    return () => {
      if (mainHlsRef.current) mainHlsRef.current.destroy();
    };
  }, []);

  useEffect(() => {
    if (!selected) return undefined;
    const video = mainVideoRef.current;
    if (!video) return undefined;
    let cancelled = false;
    const markLive = () => !cancelled && setModalStatus('LIVE');
    const markError = () => {
      if (!cancelled) {
        setModalStatus('STREAM UNAVAILABLE');
      }
    };
    video.addEventListener('playing', markLive, { once: true });
    video.addEventListener('error', markError, { once: true });
    const start = async () => {
      try {
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = selected.url;
          await video.play();
        } else {
          await loadHlsScript();
          if (!window.Hls || window.Hls.isSupported?.() === false) throw new Error('HLS playback unavailable');
          const hls = new window.Hls({ enableWorker: true, lowLatencyMode: true, capLevelToPlayerSize: true });
          mainHlsRef.current = hls;
          hls.loadSource(selected.url);
          hls.attachMedia(video);
          hls.on(window.Hls.Events?.MANIFEST_PARSED || 'hlsManifestParsed', () => video.play().catch(() => undefined));
          hls.on(window.Hls.Events?.ERROR || 'hlsError', (_event: unknown, data: { fatal?: boolean }) => data?.fatal && markError());
        }
      } catch {
        markError();
      }
    };
    start();
    return () => {
      cancelled = true;
      video.pause();
      if (mainHlsRef.current) {
        mainHlsRef.current.destroy();
        mainHlsRef.current = null;
      }
      video.removeAttribute('src');
      video.load();
      video.removeEventListener('playing', markLive);
      video.removeEventListener('error', markError);
    };
  }, [selected]);

  useEffect(() => {
    if (!selected) return undefined;
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && setSelected(null);
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selected]);

  const statusText = `${channels.length.toLocaleString()} permanently configured`;

  return (
    <main className="masslink-app">
      <header className="topbar">
        <div className="brand">
          <div className="brandmark"><span>M</span><i /></div>
          <div className="brand-copy"><strong>MASSLINK <em>OTT</em></strong><span>Live television, verified.</span></div>
        </div>
        <div className="top-controls">
          <label className="search-field">
            <Search size={17} aria-hidden="true" />
            <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(PAGE_SIZE); }} placeholder="Search channels or countries" aria-label="Search channels or countries" data-testid="input-search" />
          </label>
          <label className="country-field">
            <Globe2 size={16} aria-hidden="true" />
            <select value={country} onChange={(event) => { setCountry(event.target.value); setVisibleCount(PAGE_SIZE); }} aria-label="Filter by country" data-testid="select-country">
              <option value="">All countries</option>
              {countries.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </label>
        </div>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-grid" />
        <div className="hero-glow hero-glow-one" />
        <div className="hero-glow hero-glow-two" />
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> Live now · the world is on</div>
          <h1 id="hero-title">TV from<br /><span>everywhere.</span></h1>
          <p>A permanent collection of live television channels with checked HLS manifests and media delivery. Choose a channel to watch.</p>
          <div className="hero-actions">
            <button className="primary-button" type="button" onClick={() => document.getElementById('live')?.scrollIntoView({ behavior: 'smooth' })} data-testid="button-browse-live"><Radio size={17} /> Browse live TV</button>
            <div className="hero-note"><span className="pulse-dot" /> Fixed catalog · no startup scan</div>
          </div>
        </div>
        <div className="hero-telemetry" aria-hidden="true">
          <div><span>NETWORK</span><strong>GLOBAL / 24H</strong></div>
          <div><span>PROTOCOL</span><strong>HLS / HTTPS</strong></div>
          <div><span>STATUS</span><strong className="telemetry-live">● LIVE</strong></div>
        </div>
      </section>

      <section id="live" className="live-section">
        <div className="section-head">
          <div><p className="section-kicker">The signal room</p><h2>Verified channels</h2><p className="section-description">Saved channels with checked stream delivery. Availability may vary by region.</p></div>
          <div className="count-block"><span className="count-status"><i /> CONFIGURED</span><strong data-testid="text-channel-count">{statusText}</strong></div>
        </div>

        <div className="grid" aria-live="polite">
          {!visible.length && <div className="state-card"><WifiOff size={23} /><strong>No verified channels match</strong><p>Try a different search or open the country filter.</p><button type="button" onClick={() => { setQuery(''); setCountry(''); }} data-testid="button-clear-filters">Clear filters</button></div>}
          {visible.map((channel) => <ChannelCard key={channel.url} channel={channel} onPlay={(item) => { setModalStatus('CONNECTING'); setSelected(item); }} />)}
        </div>
        {visibleCount < filtered.length && <div className="load-more-wrap"><button className="load-more" type="button" onClick={() => setVisibleCount((value) => value + PAGE_SIZE)} data-testid="button-load-more">Load more channels <span>+{Math.min(PAGE_SIZE, filtered.length - visibleCount)}</span></button></div>}
      </section>

      <footer className="source-note"><div className="footer-mark">M</div><p>Masslink uses a permanent, curated catalog of public HLS channels checked for browser-compatible playback.</p><span>Verified catalog</span></footer>

      {selected && <div className="player-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelected(null); }}>
        <section className="player-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-media"><button className="modal-close" type="button" onClick={() => setSelected(null)} aria-label="Close player" data-testid="button-close-player"><X size={19} /></button><video ref={mainVideoRef} controls playsInline autoPlay aria-label={`${selected.name} live player`} /></div>
          <div className="modal-info"><div><strong id="modal-title">{selected.name}</strong><span>{selected.group} · {selected.country}</span></div><span className={`modal-status ${modalStatus === 'LIVE' ? 'is-live' : ''}`}><i /> {modalStatus}</span></div>
        </section>
      </div>}
    </main>
  );
}

function Router() {
  return <RoutedErrorBoundary><Switch><Route path="/" component={Home} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>;
}

function RoutedErrorBoundary({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;