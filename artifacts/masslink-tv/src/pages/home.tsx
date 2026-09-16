import React, { useState } from "react"
import { Navbar } from "@/components/navbar"
import { ChannelGrid } from "@/components/channel-grid"
import { VideoPlayer } from "@/components/video-player"
import type { Channel } from "@workspace/api-client-react"

export default function Home() {
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null)

  return (
    <div className="min-h-screen bg-background flex flex-col selection:bg-primary/30">
      <Navbar />
      
      <main className="flex-1 px-4 md:px-8">
        <div className="py-8 w-full max-w-[1400px] mx-auto">
          <div className="mb-10 text-center md:text-left">
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-white mb-4 leading-tight">
              Watch the world <br className="hidden md:block" />
              <span className="text-primary text-glow">in real-time.</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl">
              Access thousands of verified live television broadcasts from across the globe with smart native captions and synchronized translation.
            </p>
          </div>
        </div>

        <ChannelGrid onPlayChannel={setActiveChannel} />
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
