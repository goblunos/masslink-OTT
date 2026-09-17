import React from 'react';
import { motion } from 'framer-motion';
import { MessageSquare } from 'lucide-react';

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

export function Scene4() {
  return (
    <motion.div className="absolute inset-0 z-10 flex items-center justify-between px-[10vw]"
      variants={staggerContainer} initial="enter" animate="center" exit="exit"
    >
      <div className="max-w-xl">
        <motion.div variants={fadeUpBlur} className="flex items-center gap-3 text-peach font-mono uppercase tracking-widest text-lg font-bold mb-6">
          <MessageSquare size={24} /> AI Translation
        </motion.div>
        <motion.h2 variants={fadeUpBlur} className="text-[5vw] leading-[1] font-bold tracking-tight mb-8">
          Auto-detect & <br/><span className="text-peach font-serif italic font-normal">Translate</span>
        </motion.h2>
        
        <motion.div variants={fadeUpBlur} className="bg-panel-raised border border-white/10 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-orange to-peach" />
          
          <div className="font-mono text-xs text-muted-ink mb-4 flex justify-between">
            <span>DETECTED: JAPANESE</span>
            <span className="text-mint">TARGET: ENGLISH</span>
          </div>
          
          <p className="text-2xl font-serif text-white/40 mb-2">
            「次のニュースです。東京では…」
          </p>
          <p className="text-3xl font-bold text-white relative">
            "In our next story, in Tokyo..."
            <motion.span 
              className="absolute right-0 top-0 w-full h-full bg-panel-raised"
              initial={{ left: 0 }}
              animate={{ left: "100%" }}
              transition={{ duration: 1.5, delay: 1.0, ease: "linear" }}
            />
          </p>
        </motion.div>
      </div>

      <motion.div variants={popIn} className="relative w-[30vw] aspect-square flex items-center justify-center">
         <img src={`${import.meta.env.BASE_URL}audio-waves.png`} alt="" className="absolute inset-0 object-contain opacity-80 mix-blend-screen" />
         <motion.div 
           animate={{ rotate: 360 }} 
           transition={{ duration: 20, ease: "linear", repeat: Infinity }}
           className="absolute inset-[-20%] rounded-full border-2 border-dashed border-peach/20"
         />
      </motion.div>
    </motion.div>
  );
}
