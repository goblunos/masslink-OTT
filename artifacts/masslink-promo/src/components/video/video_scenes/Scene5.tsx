import React from 'react';
import { motion } from 'framer-motion';

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

export function Scene5() {
  return (
    <motion.div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-night/80 backdrop-blur-md"
      variants={staggerContainer} initial="enter" animate="center" exit="exit"
    >
      <motion.div variants={popIn} className="w-32 h-32 rounded-3xl bg-gradient-to-br from-orange to-peach shadow-[0_20px_60px_rgba(255,122,24,0.4)] grid place-items-center text-night font-mono font-bold text-7xl overflow-hidden relative mb-10">
        M
        <div className="absolute -right-3 -bottom-4 w-16 h-16 border-[6px] border-[#11131a]/75 rounded-full" />
      </motion.div>

      <motion.h1 variants={fadeUpBlur} className="text-[6vw] font-bold tracking-tight leading-none mb-6">
        Masslink <span className="font-serif italic text-peach">OTT</span>
      </motion.h1>

      <motion.p variants={fadeUpBlur} className="text-2xl text-muted-ink font-mono uppercase tracking-widest">
        The Future of Live Streaming
      </motion.p>
    </motion.div>
  );
}
