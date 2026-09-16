import * as React from "react"
import { Play, Globe2, Activity } from "lucide-react"
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
      className="group relative flex min-w-0 flex-col overflow-hidden rounded-[18px] border border-white/10 bg-card text-left shadow-[0_10px_30px_rgba(0,0,0,.2)] transition-all duration-200 hover:-translate-y-[3px] hover:border-white/20 hover:shadow-[0_18px_42px_rgba(0,0,0,.34)]"
      data-testid={`channel-card-${channel.id}`}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-[#070a0f] flex items-center justify-center">
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
            className={`object-contain w-[46%] h-[44%] max-w-full drop-shadow-md transition-opacity duration-300 ${previewing ? "opacity-0" : "opacity-100"}`}
            loading="lazy"
          />
        ) : (
          <div className="text-4xl font-black text-muted-foreground opacity-30 tracking-tighter">
            {channel.name.substring(0, 2).toUpperCase()}
          </div>
        )}
        
        {channel.featured && (
          <Badge className="absolute top-3 right-3 bg-black/60 text-[#d7deea] border-none text-[10px]">
            VERIFIED
          </Badge>
        )}
        
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="h-[54px] w-[54px] rounded-full bg-white/90 text-[#111] flex items-center justify-center shadow-[0_12px_30px_rgba(0,0,0,.35)]">
            <Play className="h-5 w-5 ml-1 fill-current" />
          </div>
        </div>
        <div className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1.5 text-[11px] font-black tracking-[.08em]"><span className="mr-2 inline-block h-2 w-2 rounded-full bg-red-400 shadow-[0_0_0_4px_rgba(255,95,95,.13)]" />LIVE</div>
      </div>

      <div className="flex flex-col gap-1.5 flex-1 p-[13px_14px_14px] relative z-10">
        <h3 className="font-extrabold text-[15px] leading-tight tracking-tight text-foreground line-clamp-1">
          {channel.name}
        </h3>
        
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground mt-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <Globe2 className="h-3 w-3 text-primary shrink-0" />
            <span className="uppercase font-medium">{channel.countryCode || channel.country}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-white/10 px-2 py-1">
            <Activity className="h-3 w-3" />
            <span className="capitalize font-medium">{channel.category}</span>
          </div>
        </div>
      </div>
    </button>
  )
}
