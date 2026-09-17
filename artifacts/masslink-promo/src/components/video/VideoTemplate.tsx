import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  VideoCanvas,
  VideoPausedContext,
  type VideoAspectRatio,
  useVideoPlayer,
} from '@/lib/video';

import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';

export const SCENE_DURATIONS = {
  scene1: 3500,
  scene2: 3000,
  scene3: 3500,
  scene4: 4000,
  scene5: 3500
};
const VIDEO_ASPECT_RATIO: VideoAspectRatio = '16:9';

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  scene1: Scene1,
  scene2: Scene2,
  scene3: Scene3,
  scene4: Scene4,
  scene5: Scene5,
};

const SCENE_START_SEC = (() => {
  const offsets: Record<string, number> = {};
  let cumulativeMs = 0;
  for (const [key, duration] of Object.entries(SCENE_DURATIONS)) {
    offsets[key] = cumulativeMs / 1000;
    cumulativeMs += duration;
  }
  return offsets;
})();

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  paused = false,
  muted = false,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  paused?: boolean;
  muted?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentSceneKey } = useVideoPlayer({ durations, loop, paused });
  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '');
  const currentScene = Object.keys(SCENE_DURATIONS).indexOf(baseSceneKey);
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSceneKeyRef = useRef<string | null>(null);

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.45;
    if (paused) {
      audio.pause();
      return;
    }
    if (lastSceneKeyRef.current !== currentSceneKey) {
      lastSceneKeyRef.current = currentSceneKey;
      const targetTime = SCENE_START_SEC[baseSceneKey] ?? 0;
      if (Math.abs(audio.currentTime - targetTime) > 0.18) audio.currentTime = targetTime;
    }
    audio.play().catch(() => {});
  }, [baseSceneKey, currentSceneKey, muted, paused]);

  return (
    <VideoPausedContext.Provider value={paused}>
      <VideoCanvas
        aspectRatio={VIDEO_ASPECT_RATIO}
        className="bg-[#080b12] text-[#f6f8fb] shadow-2xl relative"
      >
        <BackgroundLayer currentScene={currentScene} />
        
        <AnimatePresence mode="sync">
          {SceneComponent && <SceneComponent key={currentSceneKey} />}
        </AnimatePresence>

        <motion.div 
          className="absolute bottom-6 right-8 flex items-center gap-3 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: currentScene === 4 ? 0 : 1 }}
          transition={{ duration: 0.5 }}
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#ff7a18] to-[#ffb15c] shadow-lg grid place-items-center text-[#080b12] font-mono font-bold text-lg overflow-hidden relative">
            M<div className="absolute -right-1.5 -bottom-2 w-6 h-6 border-[3px] border-[#11131a]/75 rounded-full" />
          </div>
          <div className="font-mono text-xs text-[#98a2b3] uppercase tracking-widest font-bold">
            Masslink<br/><span className="text-[#ffb15c] font-serif italic text-sm normal-case tracking-normal">OTT</span>
          </div>
        </motion.div>
        <audio
          ref={audioRef}
          src={`${import.meta.env.BASE_URL}audio/bg_music.mp3`}
          preload="auto"
          autoPlay
          muted={muted}
        />
      </VideoCanvas>
    </VideoPausedContext.Provider>
  );
}

function BackgroundLayer({ currentScene }: { currentScene: number }) {
  return (
    <div className="absolute inset-0 z-0 pointer-events-none">
      <div className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.07) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          transform: 'perspective(600px) rotateX(40deg) scale(2)'
        }}
      />
      
      <motion.img 
        src={`${import.meta.env.BASE_URL}bg-waves.jpg`}
        alt=""
        className="absolute inset-0 w-full h-full object-cover opacity-30 mix-blend-screen"
        animate={{ scale: [1, 1.1, 1.2, 1.1, 1], opacity: currentScene === 4 ? 0.6 : 0.3 }}
        transition={{ duration: 17.5, ease: 'linear' }}
      />
      
      <motion.div 
        className="absolute w-[80vw] h-[80vw] rounded-full blur-[100px] pointer-events-none mix-blend-screen"
        animate={{
          x: currentScene === 0 ? '-20vw' : currentScene === 2 ? '40vw' : '10vw',
          y: currentScene === 1 ? '10vh' : currentScene === 3 ? '-40vh' : '20vh',
          backgroundColor: currentScene % 2 === 0 ? 'rgba(255, 122, 24, 0.15)' : 'rgba(53, 208, 127, 0.1)'
        }}
        transition={{ duration: 3, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  );
}
