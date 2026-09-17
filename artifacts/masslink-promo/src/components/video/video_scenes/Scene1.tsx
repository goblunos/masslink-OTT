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

export function Scene1() {
  return (
    <motion.div className="absolute inset-0 z-10 flex flex-col items-center justify-center"
      variants={staggerContainer} initial="enter" animate="center" exit="exit"
    >
      <motion.div variants={fadeUpBlur} className="text-orange font-mono text-xl tracking-[0.2em] uppercase font-bold mb-6 flex items-center gap-4">
        <div className="w-12 h-px bg-orange shadow-[0_0_10px_rgba(255,122,24,0.65)]" />
        Permanent Catalog
        <div className="w-12 h-px bg-orange shadow-[0_0_10px_rgba(255,122,24,0.65)]" />
      </motion.div>
      
      <motion.h1 variants={fadeUpBlur} className="text-[9vw] leading-[0.85] font-sans font-bold tracking-tight text-center relative">
        910+
        <br/>
        <span className="text-peach font-serif italic font-normal tracking-normal text-[10vw]">Channels</span>
      </motion.h1>
      
      <motion.p variants={fadeUpBlur} className="mt-8 text-2xl text-muted-ink max-w-2xl text-center leading-relaxed">
        A verified, unbreakable media library spanning the globe.
      </motion.p>
    </motion.div>
  );
}
