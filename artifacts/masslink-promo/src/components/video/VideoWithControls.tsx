import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronDown, ChevronUp, Pause, Play, Repeat, Volume2, VolumeX } from 'lucide-react';
import VideoTemplate, { SCENE_DURATIONS } from './VideoTemplate';
import { useSceneControls } from './useSceneControls';

const SCENE_DETAILS: Record<string, { title: string; filePath: string }> = {
  scene1: { title: 'Verified Global Catalog', filePath: 'src/components/video/video_scenes/Scene1.tsx' },
  scene2: { title: 'Country Discovery', filePath: 'src/components/video/video_scenes/Scene2.tsx' },
  scene3: { title: 'Live Playback', filePath: 'src/components/video/video_scenes/Scene3.tsx' },
  scene4: { title: 'English AI Captions', filePath: 'src/components/video/video_scenes/Scene4.tsx' },
  scene5: { title: 'Masslink OTT', filePath: 'src/components/video/video_scenes/Scene5.tsx' },
};

function formatTime(durationMs: number) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

function PlaybackStatus({
  sceneKeys,
  activeIndex,
  activeDuration,
  activeStartTime,
  totalDuration,
  tick,
  paused,
  onJumpTo,
}: {
  sceneKeys: string[];
  activeIndex: number;
  activeDuration: number;
  activeStartTime: number;
  totalDuration: number;
  tick: number;
  paused: boolean;
  onJumpTo: (index: number) => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const elapsedBaseRef = useRef(0);

  useEffect(() => {
    setElapsed(0);
    elapsedBaseRef.current = 0;
  }, [tick]);

  useEffect(() => {
    if (paused) return;
    const start = performance.now();
    const timer = window.setInterval(
      () => setElapsed(elapsedBaseRef.current + performance.now() - start),
      60,
    );
    return () => {
      window.clearInterval(timer);
      elapsedBaseRef.current += performance.now() - start;
    };
  }, [paused, tick]);

  const progress = activeDuration > 0 ? Math.min(1, elapsed / activeDuration) : 0;
  const totalElapsed = Math.min(totalDuration, activeStartTime + Math.min(elapsed, activeDuration));

  return (
    <>
      <div className="flex flex-1 items-center gap-1.5">
        {sceneKeys.map((key, index) => (
          <button
            key={key}
            type="button"
            className="relative h-3 min-h-3 flex-1 cursor-pointer overflow-hidden rounded-full bg-white/20 transition-all hover:h-4 hover:bg-white/25"
            aria-label={`Jump to scene ${index + 1}`}
            aria-current={index === activeIndex ? 'true' : undefined}
            onClick={() => onJumpTo(index)}
          >
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-[#ffb15c] transition-[width] duration-100"
              style={{ width: `${index === activeIndex ? progress * 100 : 0}%` }}
            />
          </button>
        ))}
      </div>
      <span className="shrink-0 font-mono text-lg text-white/65">
        {activeIndex + 1}/{sceneKeys.length}
      </span>
      <span className="min-w-[11ch] shrink-0 text-right font-mono text-lg tabular-nums text-white/80">
        {formatTime(totalElapsed)} / {formatTime(totalDuration)}
      </span>
    </>
  );
}

function PreviewControls() {
  const {
    sceneKeys,
    activeIndex,
    locked,
    paused,
    mountKey,
    tick,
    durations,
    activeDuration,
    activeStartTime,
    totalDuration,
    onSceneChange,
    jumpTo,
    toggleLock,
    togglePause,
  } = useSceneControls(SCENE_DURATIONS);
  const [muted, setMuted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [tapPinned, setTapPinned] = useState(false);
  const sensorRef = useRef<HTMLDivElement | null>(null);

  const handleJumpTo = useCallback((index: number) => {
    jumpTo(index);
    const key = sceneKeys[index];
    const details = SCENE_DETAILS[key];
    if (!details) return;
    window.parent.postMessage({
      type: 'REPLIT_VIDEO_SCENE_SELECTED',
      payload: {
        sceneIndex: index,
        sceneCount: sceneKeys.length,
        sceneTitle: details.title,
        filePath: details.filePath,
        lineNumber: 1,
      },
    }, '*');
  }, [jumpTo, sceneKeys]);

  useEffect(() => {
    if (!paused) return;
    const frozen = document.getAnimations().filter((animation) => animation.playState === 'running');
    frozen.forEach((animation) => animation.pause());
    return () => frozen.forEach((animation) => animation.play());
  }, [paused]);

  useEffect(() => {
    if (!(collapsed && tapPinned)) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return;
      if (sensorRef.current && !sensorRef.current.contains(event.target as Node)) setTapPinned(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [collapsed, tapPinned]);

  const onPointerEnter = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') setHovering(true);
  };
  const onPointerLeave = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') setHovering(false);
  };
  const barVisible = !collapsed || hovering || tapPinned;
  const controlClass = 'grid h-12 w-12 shrink-0 place-items-center rounded-lg text-white/65 transition-colors hover:bg-white/10 hover:text-white';

  return (
    <div className="relative h-screen w-full">
      <VideoTemplate
        key={mountKey}
        durations={durations}
        loop
        paused={paused}
        muted={muted}
        onSceneChange={onSceneChange}
      />
      <div
        ref={sensorRef}
        className="absolute inset-x-0 bottom-0 z-[100] flex h-1/4 flex-col justify-end"
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onPointerDown={(event) => {
          if (event.pointerType !== 'mouse' && collapsed) setTapPinned(true);
        }}
      >
        <div className="flex-1" aria-hidden="true" />
        <div
          className={`flex items-center gap-3 bg-black/60 px-5 py-4 backdrop-blur-md transition-all duration-200 ${
            barVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0'
          }`}
        >
          <button type="button" className={controlClass} onClick={togglePause} aria-label={paused ? 'Play' : 'Pause'}>
            {paused ? <Play size={28} /> : <Pause size={28} />}
          </button>
          <button
            type="button"
            className={`${controlClass} ${locked ? 'bg-white/15 text-[#ffb15c]' : ''}`}
            onClick={toggleLock}
            aria-label={locked ? 'Loop current scene: on' : 'Loop current scene: off'}
            aria-pressed={locked}
          >
            <Repeat size={27} />
          </button>
          <button type="button" className={controlClass} onClick={() => setMuted((value) => !value)} aria-label={muted ? 'Unmute' : 'Mute'}>
            {muted ? <VolumeX size={27} /> : <Volume2 size={27} />}
          </button>
          <div className="self-stretch w-px bg-white/15" aria-hidden="true" />
          <PlaybackStatus
            sceneKeys={sceneKeys}
            activeIndex={activeIndex}
            activeDuration={activeDuration}
            activeStartTime={activeStartTime}
            totalDuration={totalDuration}
            tick={tick}
            paused={paused}
            onJumpTo={handleJumpTo}
          />
          <button
            type="button"
            className={controlClass}
            onClick={() => {
              setCollapsed((value) => !value);
              setHovering(false);
              setTapPinned(false);
            }}
            aria-label={collapsed ? 'Show controls' : 'Hide controls'}
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronUp size={31} /> : <ChevronDown size={31} />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VideoWithControls() {
  const isIframed = typeof window !== 'undefined' && window.self !== window.top;
  return isIframed ? <PreviewControls /> : <VideoTemplate />;
}