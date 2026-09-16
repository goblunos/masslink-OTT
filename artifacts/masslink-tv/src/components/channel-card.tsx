import * as React from "react"
import { Play, Users, Globe2, Activity } from "lucide-react"
import type { Channel } from "@workspace/api-client-react"
import { Badge } from "./ui/badge"
import Hls from "hls.js"

interface ChannelCardProps {
  channel: Channel;
  onClick: (channel: Channel) => void;
}

export function ChannelCard({ channel, onClick }: ChannelCardProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const hlsRef = React.useRef<Hls | null>(null)
  const delayRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const limitRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const [previewing, setPreviewing] = React.useState(false)

  const stopPreview = React.useCallback(() => {
    if (delayRef.current) clearTimeout(delayRef.current)
    if (limitRef.current) clearTimeout(limitRef.current)
    hlsRef.current?.destroy()
    hlsRef.current = null
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.removeAttribute("src")
      videoRef.current.load()
    }
    setPreviewing(false)
  }, [])

  const startPreview = () => {
    delayRef.current = setTimeout(() => {
      const video = videoRef.current
      if (!video) return
      setPreviewing(true)
      video.muted = true
      if (Hls.isSupported()) {
        const hls = new Hls({ lowLatencyMode: true, maxBufferLength: 5, backBufferLength: 0 })
        hlsRef.current = hls
        hls.loadSource(channel.streamUrl)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => void video.play())
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = channel.streamUrl
        void video.play()
      }
      limitRef.current = setTimeout(stopPreview, 8000)
    }, 650)
  }

  React.useEffect(() => stopPreview, [stopPreview])

  return (
    <button
      type="button"
      onClick={() => onClick(channel)}
      onMouseEnter={startPreview}
      onMouseLeave={stopPreview}
      onFocus={startPreview}
      onBlur={stopPreview}
      aria-label={`Play ${channel.name} live from ${channel.country}`}
      className="group relative flex flex-col gap-3 rounded-xl bg-card p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_10px_40px_-10px_rgba(255,107,0,0.3)] hover:bg-card/80 border border-border/50 cursor-pointer overflow-hidden"
      data-testid={`channel-card-${channel.id}`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 pointer-events-none" />
      
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black flex items-center justify-center border border-white/5 group-hover:border-primary/50 transition-colors">
        <video
          ref={videoRef}
          muted
          playsInline
          aria-hidden="true"
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${previewing ? "opacity-100" : "opacity-0"}`}
        />
        {channel.logo ? (
          <img
            src={channel.logo}
            alt={channel.name}
            className="object-contain w-2/3 h-2/3 max-w-full drop-shadow-md transition-transform duration-500 group-hover:scale-110"
            loading="lazy"
          />
        ) : (
          <div className="text-4xl font-black text-muted-foreground opacity-30 tracking-tighter">
            {channel.name.substring(0, 2).toUpperCase()}
          </div>
        )}
        
        {channel.featured && (
          <Badge className="absolute top-2 right-2 bg-primary text-primary-foreground border-none">
            Featured
          </Badge>
        )}
        
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[2px]">
          <div className="h-12 w-12 rounded-full bg-primary/90 text-white flex items-center justify-center shadow-[0_0_20px_rgba(255,107,0,0.6)] transform scale-50 group-hover:scale-100 transition-transform duration-300 delay-75">
            <Play className="h-5 w-5 ml-1" />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 flex-1 relative z-10">
        <h3 className="font-bold text-lg leading-tight tracking-tight text-foreground group-hover:text-primary transition-colors line-clamp-1">
          {channel.name}
        </h3>
        
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
          <div className="flex items-center gap-1.5 bg-background/50 px-2 py-1 rounded-md border border-white/5">
            <Globe2 className="h-3 w-3 text-primary" />
            <span className="uppercase font-medium">{channel.countryCode || channel.country}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-background/50 px-2 py-1 rounded-md border border-white/5">
            <Activity className="h-3 w-3 text-primary" />
            <span className="capitalize font-medium">{channel.category}</span>
          </div>
        </div>
        
        <div className="mt-auto pt-3 flex items-center justify-between border-t border-border/50">
          <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
            <Users className="h-3.5 w-3.5 text-green-500" />
            <span>{channel.viewers.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
            <span className="text-[10px] uppercase font-bold text-red-500 tracking-wider">Live</span>
          </div>
        </div>
      </div>
    </button>
  )
}
