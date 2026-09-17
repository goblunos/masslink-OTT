import React from 'react';
import { motion } from 'framer-motion';
import { Play } from 'lucide-react';

const staggerContainer = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { staggerChildren: 0.15, delayChildren: 0.1 } },
  exit: { opacity: 0, transition: { staggerChildren: 0.1, staggerDirection: -1 } }
};

const fadeUpBlur = {
  enter: { opacity: 0, y: 30, filter: "blur(10px)", scale: 0.95 },
  center: { opacity: 1, y: 0, filter: "blur(0px)", scale: 1, transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as const } },
  exit: { opacity: 0, y: -30, filter: "blur(10px)", scale: 1.05, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const } }
};

const popIn = {
  enter: { opacity: 0, scale: 0.5, filter: "blur(10px)" },
  center: { opacity: 1, scale: 1, filter: "blur(0px)", transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] as const, type: "spring" as const, stiffness: 200, damping: 20 } },
  exit: { opacity: 0, scale: 1.2, filter: "blur(10px)", transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } }
};

export function Scene3() {
  return (
    <motion.div className="absolute inset-0 z-10 flex flex-col items-center justify-center pt-8"
      variants={staggerContainer} initial="enter" animate="center" exit="exit"
    >
      <motion.div variants={fadeUpBlur} className="text-center mb-12">
        <div className="text-red flex items-center justify-center gap-3 font-mono font-bold tracking-widest uppercase mb-4 text-lg">
          <div className="w-3 h-3 rounded-full bg-red shadow-[0_0_0_6px_rgba(255,95,95,0.15)] animate-pulse" />
          Live Playback
        </div>
        <h2 className="text-[5vw] font-bold tracking-tight">Zero <span className="text-red font-serif italic font-normal">Latency</span></h2>
      </motion.div>

      <motion.div variants={popIn} className="w-[60vw] aspect-[21/9] bg-panel rounded-[2rem] border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.5)] overflow-hidden relative" style={{ transformPerspective: 1200 }}>
        <div className="absolute inset-0 bg-[#05070b]">
           <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent z-10 pointer-events-none" />
           <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-[#1a2940] to-black opacity-60" />
           <div className="absolute inset-0 bg-cover bg-center opacity-60 mix-blend-screen" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}tokyo-news.jpg)` }} />

           <div className="absolute top-6 left-6 z-20 flex gap-4">
             <div className="bg-black/60 backdrop-blur-md text-white font-mono text-xs font-bold px-4 py-2 rounded-full border border-white/10 flex items-center gap-2">
               <div className="w-2 h-2 bg-red rounded-full shadow-[0_0_0_4px_rgba(255,95,95,0.2)]" />
               LIVE
             </div>
             <div className="bg-black/60 backdrop-blur-md text-mint font-mono text-xs font-bold px-4 py-2 rounded-full border border-white/10">
               VERIFIED
             </div>
           </div>
           
           <div className="absolute inset-0 flex items-center justify-center z-20">
             <div className="w-20 h-20 bg-white/95 rounded-full flex items-center justify-center text-black shadow-2xl backdrop-blur-xl">
               <Play size={32} fill="currentColor" className="ml-2" />
             </div>
           </div>

           <div className="absolute bottom-6 left-6 z-20">
             <h3 className="text-3xl font-bold mb-2">NHK World Premium</h3>
             <div className="text-white/60 font-mono text-sm flex gap-4">
               <span>News & Info</span>
               <span className="border border-white/20 rounded-full px-3 py-0.5">Japan</span>
             </div>
           </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
