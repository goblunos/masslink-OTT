import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, Play, X, Radio, Globe2, ChevronDown, WifiOff, ClosedCaption, MessageSquareText, RefreshCw, AlertCircle, Loader2, Volume2, VolumeX, Maximize, Minimize, Pause } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { VERIFIED_CHANNELS, type Channel } from '@/data/verified-channels';
import Hls from 'hls.js';

const queryClient = new QueryClient();
const PAGE_SIZE = 32;
const COUNTRY_CODES: Record<string, string> = {
  Albania: 'AL', Andorra: 'AD', Argentina: 'AR', Armenia: 'AM', Australia: 'AU',
  Austria: 'AT', Azerbaijan: 'AZ', Belarus: 'BY', Belgium: 'BE',
  'Bosnia & Herzegovina': 'BA', Brazil: 'BR', Bulgaria: 'BG', Canada: 'CA',
  Chad: 'TD', Chile: 'CL', China: 'CN', 'Costa Rica': 'CR', Croatia: 'HR',
  Cyprus: 'CY', Czechia: 'CZ', Denmark: 'DK', 'Dominican Republic': 'DO',
  Egypt: 'EG', Estonia: 'EE', 'Faroe Islands': 'FO', Finland: 'FI', France: 'FR',
  Georgia: 'GE', Germany: 'DE', Ghana: 'GH', Greece: 'GR', 'Hong Kong SAR China': 'HK',
  Hungary: 'HU', Iceland: 'IS', India: 'IN', Iraq: 'IQ', Ireland: 'IE', Israel: 'IL',
  Italy: 'IT', Japan: 'JP', Kazakhstan: 'KZ', Kenya: 'KE', Kosovo: 'XK', Latvia: 'LV',
  Lebanon: 'LB', Lithuania: 'LT', Luxembourg: 'LU', Malta: 'MT', Mexico: 'MX',
  Moldova: 'MD', Monaco: 'MC', Mongolia: 'MN', Montenegro: 'ME', Netherlands: 'NL',
  Nigeria: 'NG', 'North Korea': 'KP', 'North Macedonia': 'MK', Norway: 'NO',
  Peru: 'PE', Poland: 'PL', Portugal: 'PT', Qatar: 'QA', Romania: 'RO', Russia: 'RU',
  'Saudi Arabia': 'SA', Serbia: 'RS', Slovakia: 'SK', Slovenia: 'SI', Somalia: 'SO',
  'South Korea': 'KR', Spain: 'ES', Sweden: 'SE', Switzerland: 'CH', Türkiye: 'TR',
  Ukraine: 'UA', 'United Arab Emirates': 'AE', 'United Kingdom': 'GB',
  'United States': 'US', Venezuela: 'VE',
};

function countryFlagUrl(country: string) {
  if (!country || country === 'International') return null;
  const code = COUNTRY_CODES[country];
  return code ? `https://flagicons.lipis.dev/flags/4x3/${code.toLowerCase()}.svg` : null;
}

type HlsInstance = {
  loadSource: (url: string) => void;
  attachMedia: (video: HTMLVideoElement) => void;
  destroy: () => void;
  startLoad?: () => void;
  subtitleTrack?: number;
  subtitleTracks?: Array<{ name?: string; lang?: string; id?: number | string }>;
  on: (event: string, callback: (...args: any[]) => void) => void;
};

type HlsConstructor = new (options?: Record<string, unknown>) => HlsInstance & {
  constructor: HlsConstructor;
};

type NativeCaptionTrack = {
  id: string;
  label: string;
  language: string;
  default: boolean;
  hlsIndex?: number;
};

type CaptionCue = {
  id: number;
  startMs: number;
  endMs: number;
  text: string;
  language: string;
  final: boolean;
};

type CaptionSession = {
  id: string;
  channelId: string;
  status: 'starting' | 'listening' | 'reconnecting' | 'stopped' | 'error' | 'unsupported';
  language: string;
  detectedLanguage?: string | null;
  message?: string | null;
  createdAt: string;
  expiresAt: string;
  cueCount: number;
};

type StreamVerification = {
  channelId: string;
  available: boolean;
  checkedAt: string;
  latencyMs: number;
  error?: string | null;
  nativeCaptions: NativeCaptionTrack[];
};

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json() as { error?: string; message?: string };
      detail = body.error || body.message || '';
    } catch {
      // Keep the HTTP status when the API did not return JSON.
    }
    throw new Error(detail || `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function verifyChannel(channelId: string) {
  return apiRequest<StreamVerification>(`/api/channels/${encodeURIComponent(channelId)}/verify`, { method: 'POST' });
}

async function startCaptionSession(channel: Channel, language: string) {
  return apiRequest<CaptionSession>('/api/captions/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelId: channel.id, streamUrl: channel.url, language }),
  });
}

async function stopCaptionSession(sessionId: string) {
  return apiRequest<void>(`/api/captions/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
}

function formatCueTime(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function isEnglishCaptionTrack(track: NativeCaptionTrack) {
  const language = track.language.trim().toLowerCase().replace(/_/g, '-');
  return language === 'en' || language.startsWith('en-') || language === 'eng' || /\benglish\b/i.test(track.label);
}

function isEnglishCue(cue: CaptionCue) {
  const language = cue.language.trim().toLowerCase().replace(/_/g, '-');
  return language === 'en' || language.startsWith('en-') || language === 'eng';
}

function sameCaptionIdentity(first: Pick<NativeCaptionTrack, 'label' | 'language'>, second: Pick<NativeCaptionTrack, 'label' | 'language'>) {
  return first.label === second.label &&
    first.language.trim().toLowerCase().replace(/_/g, '-') === second.language.trim().toLowerCase().replace(/_/g, '-');
}

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
    try {
      // Keep the playback engine in the application bundle so browser tests and
      // offline deployments do not depend on a mutable third-party CDN script.
      window.Hls = Hls as unknown as HlsConstructor & { isSupported?: () => boolean; Events?: Record<string, string> };
      resolve();
    } catch {
      reject(new Error('HLS playback engine unavailable'));
    }
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

function LivePlayer({ channel, onClose }: { channel: Channel; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<HlsInstance | null>(null);
  const sessionRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const aiIntentRef = useRef(false);
  const [status, setStatus] = useState<'loading' | 'playing' | 'error' | 'buffering'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [nativeCaptions, setNativeCaptions] = useState<NativeCaptionTrack[]>([]);
  const [selectedNativeTrack, setSelectedNativeTrack] = useState('none');
  const [showCCMenu, setShowCCMenu] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [aiCaptionsEnabled, setAiCaptionsEnabled] = useState(false);
  const [session, setSession] = useState<CaptionSession | null>(null);
  const [cues, setCues] = useState<CaptionCue[]>([]);
  const [aiError, setAiError] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [displayedCue, setDisplayedCue] = useState<CaptionCue | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nativeTextTrackRefsRef = useRef<Map<string, TextTrack>>(new Map());
  const aiEnabledRef = useRef(false);
  const playingRef = useRef(false);
  const displayedCueRef = useRef<CaptionCue | null>(null);
  const captionQueueRef = useRef<CaptionCue[]>([]);
  const seenCueIdsRef = useRef<Set<number>>(new Set());
  const captionTimerRef = useRef<number | null>(null);
  const pumpRef = useRef<() => void>(() => undefined);

  const clearCaptionPlayback = useCallback((clearSeen = false) => {
    if (captionTimerRef.current !== null) {
      window.clearTimeout(captionTimerRef.current);
      captionTimerRef.current = null;
    }
    captionQueueRef.current = [];
    displayedCueRef.current = null;
    setDisplayedCue(null);
    if (clearSeen) seenCueIdsRef.current.clear();
  }, []);

  const pumpCaptionQueue = useCallback(() => {
    if (!aiEnabledRef.current || !playingRef.current || displayedCueRef.current || captionTimerRef.current !== null) return;
    const next = captionQueueRef.current.shift();
    if (!next) return;
    displayedCueRef.current = next;
    setDisplayedCue(next);
    // Cue timestamps are source-relative and can arrive late. Display in receipt order,
    // using the source duration only as a bounded, honest on-screen dwell time.
    const sourceDuration = next.endMs > next.startMs ? next.endMs - next.startMs : 3200;
    const displayDuration = Math.min(7000, Math.max(1200, sourceDuration));
    captionTimerRef.current = window.setTimeout(() => {
      captionTimerRef.current = null;
      displayedCueRef.current = null;
      setDisplayedCue(null);
      pumpRef.current();
    }, displayDuration);
  }, []);

  const enqueueCaptionCues = useCallback((nextCues: CaptionCue[]) => {
    const englishCues = nextCues.filter(isEnglishCue);
    setCues(englishCues);
    // Do not build a stale backlog while paused or before playback starts. The
    // transcript remains available, but captions resume with newly received cues.
    if (!aiEnabledRef.current || !playingRef.current) {
      for (const cue of englishCues) seenCueIdsRef.current.add(cue.id);
      return;
    }
    for (const cue of englishCues) {
      if (seenCueIdsRef.current.has(cue.id)) continue;
      seenCueIdsRef.current.add(cue.id);
      captionQueueRef.current.push(cue);
    }
    captionQueueRef.current.sort((first, second) => first.startMs - second.startMs || first.id - second.id);
    pumpRef.current();
  }, []);

  useEffect(() => {
    pumpRef.current = pumpCaptionQueue;
  }, [pumpCaptionQueue]);

  useEffect(() => {
    aiEnabledRef.current = aiCaptionsEnabled;
    playingRef.current = isPlaying;
    if (aiCaptionsEnabled && isPlaying) pumpCaptionQueue();
    if (!aiCaptionsEnabled || !isPlaying) clearCaptionPlayback();
  }, [aiCaptionsEnabled, clearCaptionPlayback, isPlaying, pumpCaptionQueue]);

  const syncSafariTextTracks = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.textTracks.length === 0) return;
    if (hlsRef.current?.subtitleTracks && hlsRef.current.subtitleTracks.length > 0) return;
    const actualTracks = Array.from(video.textTracks);
    nativeTextTrackRefsRef.current.clear();
    setNativeCaptions((previousTracks) => {
      const nextTracks = actualTracks.map((track, index) => {
        const previous = previousTracks[index];
        const descriptor = previous && sameCaptionIdentity(previous, { label: track.label, language: track.language })
          ? previous
          : previousTracks.find((candidate) => sameCaptionIdentity(candidate, { label: track.label, language: track.language }));
        const option: NativeCaptionTrack = {
          id: `safari-${index}`,
          label: track.label || descriptor?.label || `English track ${index + 1}`,
          language: track.language || descriptor?.language || 'und',
          default: track.mode === 'showing' || descriptor?.default === true,
        };
        nativeTextTrackRefsRef.current.set(option.id, track);
        return option;
      }).filter(isEnglishCaptionTrack);
      const unchanged = nextTracks.length === previousTracks.length &&
        nextTracks.every((track, index) => track.id === previousTracks[index]?.id &&
          sameCaptionIdentity(track, previousTracks[index]) && track.default === previousTracks[index]?.default);
      return unchanged ? previousTracks : nextTracks;
    });
  }, []);

  const syncHlsSubtitleTracks = useCallback((tracks: Array<{ name?: string; lang?: string; id?: number | string }>) => {
    nativeTextTrackRefsRef.current.clear();
    setSelectedNativeTrack('none');
    setNativeCaptions((previousTracks) => tracks.map((track, index) => {
      const actualLabel = track.name || '';
      const actualLanguage = track.lang || '';
      // Metadata is only used as a stable descriptor; playback selection is
      // always the actual HLS index, never a label/language lookup.
      const descriptor = track.name && track.lang
        ? previousTracks.find((candidate) => sameCaptionIdentity(candidate, { label: track.name!, language: track.lang! }))
        : undefined;
      return {
        id: `hls-${index}`,
        label: actualLabel || actualLanguage,
        language: actualLanguage,
        default: descriptor?.default || false,
        hlsIndex: index,
      };
    }).filter(isEnglishCaptionTrack));
  }, []);

  const destroyStream = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  }, []);

  const stopActiveSession = useCallback(async () => {
    const id = sessionRef.current;
    sessionRef.current = null;
    setSession(null);
    setCues([]);
    if (id) {
      try {
        await stopCaptionSession(id);
      } catch {
        // The session may already have expired; it is stopped server-side in either case.
      }
    }
  }, []);

  const setupStream = useCallback((url: string) => {
    const video = videoRef.current;
    if (!video) return;
    destroyStream();
    setStatus('loading');
    setErrorMessage('');
    const markPlaying = () => {
      setStatus('playing');
      setIsPlaying(true);
    };
    const markError = () => {
      setStatus('error');
      setErrorMessage('This stream could not be played. Try refreshing or choose another channel.');
      setIsPlaying(false);
    };
    video.addEventListener('playing', markPlaying, { once: true });
    video.addEventListener('error', markError, { once: true });
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      void video.play().catch(() => undefined);
      return;
    }
    void loadHlsScript().then(() => {
      if (!mountedRef.current || !videoRef.current) return;
      if (!window.Hls || window.Hls.isSupported?.() === false) {
        markError();
        return;
      }
      const hls = new window.Hls({ enableWorker: true, lowLatencyMode: true, capLevelToPlayerSize: true });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(window.Hls.Events?.MANIFEST_PARSED || 'hlsManifestParsed', () => {
        syncHlsSubtitleTracks(hls.subtitleTracks || []);
        syncSafariTextTracks();
        void video.play().catch(() => undefined);
      });
      hls.on(window.Hls.Events?.ERROR || 'hlsError', (_event: unknown, data: { fatal?: boolean; type?: string }) => {
        if (data?.fatal) {
          setStatus(data.type === 'networkError' ? 'buffering' : 'error');
          setErrorMessage(data.type === 'networkError'
            ? 'The stream is buffering. Try refreshing if it does not recover.'
            : 'A fatal playback error occurred.');
        }
      });
    }).catch(() => markError());
  }, [destroyStream, syncHlsSubtitleTracks, syncSafariTextTracks]);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    const initialize = async () => {
      setStatus('loading');
      try {
        const verification = await verifyChannel(channel.id);
        if (cancelled || !mountedRef.current) return;
        setNativeCaptions((verification.nativeCaptions || []).filter(isEnglishCaptionTrack));
        if (!verification.available) {
          setStatus('error');
          setErrorMessage(verification.error || 'The stream is currently unavailable.');
          return;
        }
        setupStream(channel.url);
      } catch (error) {
        if (!cancelled && mountedRef.current) {
          setStatus('error');
          setErrorMessage(error instanceof Error ? error.message : 'Unable to verify this stream.');
        }
      }
    };
    void initialize();
    return () => {
      cancelled = true;
      mountedRef.current = false;
      aiIntentRef.current = false;
      clearCaptionPlayback(true);
      destroyStream();
      void stopActiveSession();
    };
  }, [channel.id, channel.url, clearCaptionPlayback, destroyStream, setupStream, stopActiveSession]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    for (const track of Array.from(video.textTracks)) track.mode = 'disabled';
    if (hlsRef.current) hlsRef.current.subtitleTrack = -1;
    if (selectedNativeTrack === 'none') return;
    const selected = nativeCaptions.find((track) => track.id === selectedNativeTrack);
    if (!selected) return;
    if (hlsRef.current && selected.hlsIndex !== undefined &&
      selected.hlsIndex >= 0 && selected.hlsIndex < (hlsRef.current.subtitleTracks?.length || 0)) {
      hlsRef.current.subtitleTrack = selected.hlsIndex;
    }
    const native = nativeTextTrackRefsRef.current.get(selected.id);
    if (native) native.mode = 'showing';
  }, [nativeCaptions, selectedNativeTrack, status]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const sync = () => syncSafariTextTracks();
    video.addEventListener('loadedmetadata', sync);
    video.addEventListener('loadeddata', sync);
    video.textTracks.addEventListener('addtrack', sync);
    video.textTracks.addEventListener('removetrack', sync);
    video.textTracks.addEventListener('change', sync);
    return () => {
      video.removeEventListener('loadedmetadata', sync);
      video.removeEventListener('loadeddata', sync);
      video.textTracks.removeEventListener('addtrack', sync);
      video.textTracks.removeEventListener('removetrack', sync);
      video.textTracks.removeEventListener('change', sync);
    };
  }, [syncSafariTextTracks]);

  useEffect(() => {
    if (!sessionRef.current || !aiCaptionsEnabled) return undefined;
    let cancelled = false;
    const poll = async () => {
      const id = sessionRef.current;
      if (!id) return;
      try {
        const [nextSession, nextCues] = await Promise.all([
          apiRequest<CaptionSession>(`/api/captions/sessions/${encodeURIComponent(id)}`),
          apiRequest<CaptionCue[]>(`/api/captions/sessions/${encodeURIComponent(id)}/cues`),
        ]);
        if (!cancelled && mountedRef.current) {
          setSession(nextSession);
          enqueueCaptionCues(nextCues);
          if (nextSession.status === 'error' || nextSession.status === 'unsupported') {
            setAiError(nextSession.message || 'AI captions are unavailable for this stream.');
            clearCaptionPlayback();
          }
        }
      } catch (error) {
        if (!cancelled && mountedRef.current) {
          setAiError(error instanceof Error ? error.message : 'Unable to update the live transcript.');
        }
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [aiCaptionsEnabled, clearCaptionPlayback, enqueueCaptionCues, session?.id]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showCCMenu) setShowCCMenu(false);
        else if (showTranscript) setShowTranscript(false);
        else onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, showCCMenu, showTranscript]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleAiCaptions = async (enabled: boolean) => {
    setAiError('');
    aiIntentRef.current = enabled;
    setAiCaptionsEnabled(enabled);
    if (!enabled) {
      clearCaptionPlayback(true);
      await stopActiveSession();
      return;
    }
    clearCaptionPlayback(true);
    setSelectedNativeTrack('none');
    try {
      const next = await startCaptionSession(channel, 'en');
      if (!mountedRef.current || !aiIntentRef.current) {
        await stopCaptionSession(next.id).catch(() => undefined);
        return;
      }
      sessionRef.current = next.id;
      setSession(next);
    } catch (error) {
      setAiCaptionsEnabled(false);
      setAiError(error instanceof Error ? error.message : 'AI captions could not be started.');
    }
  };

  const selectNativeCaptionTrack = async (trackId: string) => {
    setSelectedNativeTrack(trackId);
    if (trackId === 'none' || !aiCaptionsEnabled) return;
    aiIntentRef.current = false;
    setAiCaptionsEnabled(false);
    clearCaptionPlayback(true);
    await stopActiveSession();
  };

  const refresh = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setupStream(channel.url);
    window.setTimeout(() => setIsRefreshing(false), 700);
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await containerRef.current.requestFullscreen();
    } catch {
      setErrorMessage('Fullscreen is not available in this browser.');
    }
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  return (
    <section className={`player-modal ${showTranscript && !isFullscreen ? 'has-transcript' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="player-layout">
        <div className="modal-media" ref={containerRef}>
          <video
            ref={videoRef}
            controls
            playsInline
            autoPlay
            aria-label={`${channel.name} live player`}
            onPlay={() => { setIsPlaying(true); setStatus('playing'); }}
            onPause={() => { setIsPlaying(false); clearCaptionPlayback(); }}
          />
          {status === 'loading' && <div className="player-state" data-testid="status-player-loading"><Loader2 className="spin" size={26} /><span>Tuning into {channel.name}...</span></div>}
          {(status === 'error' || status === 'buffering') && (
            <div className="player-state player-error" role="alert" data-testid="status-player-error">
              {status === 'buffering' ? <Loader2 className="spin" size={26} /> : <AlertCircle size={26} />}
              <span>{errorMessage || 'Playback is unavailable.'}</span>
              <button type="button" onClick={refresh} data-testid="button-refresh-player"><RefreshCw size={14} /> Try again</button>
            </div>
          )}
          {aiCaptionsEnabled && displayedCue && (
            <div className="caption-overlay" aria-live="polite" data-testid="text-live-caption">
              {displayedCue.text}
            </div>
          )}
          <div className="player-top-actions">
            <span className="live-player-pill"><i /> LIVE</span>
            <div>
              <button type="button" onClick={refresh} aria-label="Refresh stream" title="Refresh stream" data-testid="button-refresh-stream"><RefreshCw className={isRefreshing ? 'spin' : ''} size={16} /></button>
              <button type="button" onClick={onClose} aria-label="Close player" title="Close player" data-testid="button-close-player"><X size={19} /></button>
            </div>
          </div>
          <div className="player-tool-row" aria-label="Player options">
            <button type="button" onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'} data-testid="button-toggle-play">{isPlaying ? <Pause size={15} /> : <Play size={15} fill="currentColor" />}</button>
            <button type="button" onClick={toggleMute} aria-label={isMuted ? 'Unmute' : 'Mute'} data-testid="button-toggle-mute">{isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}</button>
            <input type="range" min="0" max="1" step="0.05" value={isMuted ? 0 : volume} onChange={(event) => { const value = Number(event.target.value); setVolume(value); if (videoRef.current) { videoRef.current.volume = value; videoRef.current.muted = value === 0; setIsMuted(value === 0); } }} aria-label="Volume" data-testid="input-volume" />
            <span className="player-tools-spacer" />
            <button type="button" className={showCCMenu ? 'active' : ''} onClick={() => setShowCCMenu((value) => !value)} aria-label="Captions and subtitles settings" aria-expanded={showCCMenu} data-testid="button-caption-settings"><ClosedCaption size={16} /></button>
            <button type="button" className={showTranscript ? 'active' : ''} onClick={() => setShowTranscript((value) => !value)} aria-label="Toggle transcript panel" aria-expanded={showTranscript} data-testid="button-toggle-transcript"><MessageSquareText size={16} /></button>
            <button type="button" onClick={toggleFullscreen} aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} data-testid="button-toggle-fullscreen">{isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}</button>
          </div>
          {showCCMenu && (
            <div className="caption-menu" role="dialog" aria-label="English captions settings">
              <div className="caption-menu-head"><strong>English captions</strong><button type="button" onClick={() => setShowCCMenu(false)} aria-label="Close caption settings" data-testid="button-close-caption-settings"><X size={14} /></button></div>
              <p className="caption-menu-intro">{nativeCaptions.length ? 'Native English tracks are shown directly. AI captions translate other languages to English.' : 'No English native track detected. Enable English AI captions to translate this stream.'} AI captions are displayed as received and may trail the live video.</p>
              <label className="caption-field">
                <span>English native tracks</span>
                <select value={selectedNativeTrack} onChange={(event) => void selectNativeCaptionTrack(event.target.value)} aria-label="Native caption track" data-testid="select-native-caption">
                  <option value="none">{nativeCaptions.length ? 'Off' : 'No English native track detected'}</option>
                  {nativeCaptions.map((track) => <option key={track.id} value={track.id}>{track.label || track.language}</option>)}
                </select>
              </label>
              <div className="ai-caption-setting">
                <div><strong>English AI captions</strong><span>Optional transcription + translation</span></div>
                <button type="button" role="switch" aria-checked={aiCaptionsEnabled} aria-label="Enable English AI captions" className={`caption-switch ${aiCaptionsEnabled ? 'on' : ''}`} onClick={() => void toggleAiCaptions(!aiCaptionsEnabled)} data-testid="button-toggle-ai-captions"><i /></button>
              </div>
              {aiCaptionsEnabled && <div className="caption-status" role="status" data-testid="status-ai-captions">English output · {session?.status || 'starting'} · delayed live captions</div>}
              {aiError && <div className="caption-error" role="alert" data-testid="status-caption-error"><AlertCircle size={14} /> {aiError}</div>}
            </div>
          )}
        </div>
        {showTranscript && !isFullscreen && (
          <aside className="transcript-panel" aria-label="English live transcript">
            <div className="transcript-head"><strong><MessageSquareText size={16} /> English transcript</strong><button type="button" onClick={() => setShowTranscript(false)} aria-label="Close transcript" data-testid="button-close-transcript"><X size={15} /></button></div>
            {!aiCaptionsEnabled ? <div className="transcript-empty"><MessageSquareText size={24} /><p>Enable English AI captions to translate this live stream into an English transcript.</p><button type="button" onClick={() => setShowCCMenu(true)} data-testid="button-open-caption-settings">Open English caption settings</button></div> : cues.length ? <div className="transcript-cues">{cues.map((cue) => <div className={`transcript-cue ${cue.final ? '' : 'interim'}`} key={cue.id}><time>{formatCueTime(cue.startMs)}</time><span>{cue.text}</span></div>)}</div> : <div className="transcript-empty"><Loader2 className="spin" size={20} /><p>{aiError || 'Listening for speech and translating to English...'}</p></div>}
          </aside>
        )}
      </div>
      <div className="modal-info"><div><strong id="modal-title">{channel.name}</strong><span>{channel.group} · {channel.country}</span></div><span className={`modal-status ${status === 'playing' ? 'is-live' : ''}`}><i /> {status === 'playing' ? 'LIVE' : status === 'error' ? 'STREAM UNAVAILABLE' : status.toUpperCase()}</span></div>
    </section>
  );
}

function Home() {
  const channels = VERIFIED_CHANNELS;
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<Channel | null>(null);

  const countries = useMemo(() => [...new Set(channels.map((channel) => channel.country).filter(Boolean))].sort(), [channels]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return channels.filter((channel) => {
      const haystack = `${channel.name} ${channel.displayName} ${channel.country} ${channel.group}`.toLowerCase();
      return (!normalized || haystack.includes(normalized)) && (!country || channel.country === country);
    });
  }, [channels, country, query]);
  const visible = filtered.slice(0, visibleCount);

  const statusText = `${channels.length.toLocaleString()} permanently configured`;

  const CountryDropdown = () => {
    const [open, setOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      if (!open) return;
      const closeOnOutsideClick = (event: PointerEvent) => {
        if (!dropdownRef.current?.contains(event.target as Node)) setOpen(false);
      };
      const closeOnEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') setOpen(false);
      };
      document.addEventListener('pointerdown', closeOnOutsideClick);
      document.addEventListener('keydown', closeOnEscape);
      return () => {
        document.removeEventListener('pointerdown', closeOnOutsideClick);
        document.removeEventListener('keydown', closeOnEscape);
      };
    }, [open]);

    return (
      <div className={`country-field ${open ? 'is-open' : ''}`} ref={dropdownRef}>
        <button
          className="country-trigger"
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label="Filter by country"
          aria-haspopup="listbox"
          aria-expanded={open}
          data-testid="select-country"
        >
          <span className="country-trigger-flag" aria-hidden="true">
            {countryFlagUrl(country)
              ? <img src={countryFlagUrl(country)!} alt="" />
              : <Globe2 size={17} />}
          </span>
          <span>{country || 'All countries'}</span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
        {open && (
          <div className="country-menu" role="listbox" aria-label="Country list">
            <button
              className={`country-option ${country === '' ? 'is-selected' : ''}`}
              type="button"
              role="option"
              aria-selected={country === ''}
              onClick={() => { setCountry(''); setVisibleCount(PAGE_SIZE); setOpen(false); }}
            >
              <span className="country-flag" aria-hidden="true"><Globe2 size={25} /></span>
              <span>All countries</span>
            </button>
            {countries.map((item) => (
              <button
                className={`country-option ${country === item ? 'is-selected' : ''}`}
                key={item}
                type="button"
                role="option"
                aria-selected={country === item}
                onClick={() => { setCountry(item); setVisibleCount(PAGE_SIZE); setOpen(false); }}
              >
                <span className="country-flag" aria-hidden="true">
                  {countryFlagUrl(item)
                    ? <img src={countryFlagUrl(item)!} alt="" loading="lazy" />
                    : <Globe2 size={25} />}
                </span>
                <span>{item}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

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
          <CountryDropdown />
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
          {visible.map((channel) => <ChannelCard key={channel.url} channel={channel} onPlay={(item) => setSelected(item)} />)}
        </div>
        {visibleCount < filtered.length && <div className="load-more-wrap"><button className="load-more" type="button" onClick={() => setVisibleCount((value) => value + PAGE_SIZE)} data-testid="button-load-more">Load more channels <span>+{Math.min(PAGE_SIZE, filtered.length - visibleCount)}</span></button></div>}
      </section>

      <footer className="source-note"><div className="footer-mark">M</div><p>Masslink uses a permanent, curated catalog of public HLS channels checked for browser-compatible playback.</p><span>Verified catalog</span></footer>

      {selected && <div className="player-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelected(null); }}>
        <LivePlayer channel={selected} onClose={() => setSelected(null)} />
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