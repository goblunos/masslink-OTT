import React from 'react';
import { motion } from 'framer-motion';
import { Globe2 } from 'lucide-react';

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

export function Scene2() {
  return (
    <motion.div className="absolute inset-0 z-10 flex items-center justify-between px-[10vw]"
      variants={staggerContainer} initial="enter" animate="center" exit="exit"
    >
      <div className="max-w-xl">
        <motion.div variants={fadeUpBlur} className="flex items-center gap-3 text-mint font-mono uppercase tracking-widest text-lg font-bold mb-6">
          <Globe2 size={24} /> Global Reach
        </motion.div>
        <motion.h2 variants={fadeUpBlur} className="text-[5vw] font-bold tracking-tight mb-6 leading-tight">
          Filter by <br/><span className="text-mint font-serif italic font-normal">Country</span>
        </motion.h2>
        <motion.p variants={fadeUpBlur} className="text-xl text-muted-ink">
          Zero boundaries. Instant access to localized content worldwide.
        </motion.p>
      </div>

      <motion.div variants={popIn} className="relative w-[35vw] aspect-square">
        <img src={`${import.meta.env.BASE_URL}world-map.png`} alt="" className="absolute inset-0 object-contain opacity-60" />
        
        <motion.div className="absolute top-1/4 left-10 bg-panel-raised border border-white/10 px-6 py-3 rounded-full text-lg shadow-xl backdrop-blur-md font-mono"
          variants={popIn}
        >
          <span className="text-mint">#</span> Japan
        </motion.div>
        
        <motion.div className="absolute top-1/2 right-0 bg-panel-raised border border-white/10 px-6 py-3 rounded-full text-lg shadow-xl backdrop-blur-md font-mono"
          variants={popIn}
        >
          <span className="text-mint">#</span> UK
        </motion.div>

        <motion.div className="absolute bottom-1/4 left-1/3 bg-panel-raised border border-white/10 px-6 py-3 rounded-full text-lg shadow-xl backdrop-blur-md font-mono"
          variants={popIn}
        >
          <span className="text-mint">#</span> Brazil
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
