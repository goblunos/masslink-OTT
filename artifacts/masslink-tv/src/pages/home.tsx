import React, { useState } from "react"
import { Navbar } from "@/components/navbar"
import { ChannelGrid } from "@/components/channel-grid"
import { VideoPlayer } from "@/components/video-player"
import type { Channel } from "@workspace/api-client-react"

export default function Home() {
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null)

  return (
    <div className="min-h-screen bg-background/60 flex flex-col selection:bg-primary/30">
      <Navbar />
      
      <main className="flex-1 px-3 md:px-[22px] pb-16">
        <div className="w-full max-w-[1600px] mx-auto">
          <section className="relative mt-2 mb-7 min-h-[290px] overflow-hidden rounded-[26px] border border-white/10 bg-[linear-gradient(90deg,rgba(8,11,18,.98)_0%,rgba(8,11,18,.72)_48%,rgba(8,11,18,.30)_100%),linear-gradient(135deg,#182338,#111722_55%,#24170f)] shadow-[0_18px_45px_rgba(0,0,0,.35)] flex items-end">
            <div className="relative z-10 max-w-[780px] p-6 md:p-[34px]">
              <div className="text-xs font-extrabold uppercase tracking-[.16em] text-orange-300">Live now</div>
              <h1 className="my-3 text-[clamp(34px,5vw,72px)] font-black leading-[.95] tracking-[-.04em] text-white">
                TV from around the world.
              </h1>
              <p className="max-w-[720px] leading-relaxed text-[#c6ceda]">
                Browse verified live HLS channels with native subtitles and optional AI-powered close captions for streams that do not provide them.
              </p>
              <button type="button" onClick={() => document.getElementById("live")?.scrollIntoView({ behavior: "smooth" })} className="mt-5 min-h-[42px] rounded-xl bg-white px-4 font-extrabold text-[#111]">
                Browse Live TV
              </button>
            </div>
            <div className="pointer-events-none absolute -bottom-1/2 -right-[8%] aspect-square w-[58%] rounded-full bg-[radial-gradient(circle,rgba(255,122,24,.25),transparent_66%)]" />
          </section>
          <div id="live">
            <ChannelGrid onPlayChannel={setActiveChannel} />
          </div>
        </div>
      </main>

      {/* Modal Player */}
      {activeChannel && (
        <VideoPlayer 
          channel={activeChannel} 
          onClose={() => setActiveChannel(null)} 
        />
      )}
    </div>
  )
}
