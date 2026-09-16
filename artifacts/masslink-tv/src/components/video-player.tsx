import React, { useEffect, useRef, useState, useCallback } from "react"
import Hls from "hls.js"
import type { Channel, NativeCaptionTrack, CaptionCue } from "@workspace/api-client-react"
import { 
  useVerifyChannel, 
  useStartCaptionSession, 
  useGetCaptionSession, 
  useListCaptionCues,
  stopCaptionSession,
  getGetCaptionSessionQueryKey,
  getListCaptionCuesQueryKey,
} from "@workspace/api-client-react"
import { PlayerControls } from "./player-controls"
import { AlertCircle, Loader2, MessageSquareText, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { ScrollArea } from "./ui/scroll-area"
import { Switch } from "./ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { Button } from "./ui/button"

interface VideoPlayerProps {
  channel: Channel;
  onClose: () => void;
}

export function VideoPlayer({ channel, onClose }: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement>(null)
  
  const [isPlaying, setIsPlaying] = useState(true)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [status, setStatus] = useState<"loading" | "playing" | "error" | "buffering">("loading")
  const [errorMessage, setErrorMessage] = useState("")
  const [currentTimeMs, setCurrentTimeMs] = useState(0)
  
  // Captions & Transcript state
  const [showCCMenu, setShowCCMenu] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)
  
  const [nativeCaptions, setNativeCaptions] = useState<NativeCaptionTrack[]>([])
  const [selectedNativeTrack, setSelectedNativeTrack] = useState<string>("none")
  
  const [aiCaptionsEnabled, setAiCaptionsEnabled] = useState(false)
  const [aiLanguage, setAiLanguage] = useState("auto")
  const [sessionId, setSessionId] = useState<string | null>(null)

  // API Hooks
  const verifyChannel = useVerifyChannel()
  const startCaptionSessionMutation = useStartCaptionSession()
  
  // Polling only if sessionId exists
  const { data: session } = useGetCaptionSession(sessionId as string, {
    query: {
      enabled: !!sessionId && aiCaptionsEnabled,
      refetchInterval: 5000,
      queryKey: getGetCaptionSessionQueryKey(sessionId ?? ""),
    }
  })
  
  const { data: cues } = useListCaptionCues(sessionId as string, {
    query: {
      enabled: !!sessionId && aiCaptionsEnabled && session?.status === "listening",
      refetchInterval: 2000,
      queryKey: getListCaptionCuesQueryKey(sessionId ?? ""),
    }
  })

  // Initialize and verify stream
  useEffect(() => {
    let mounted = true
    
    const initStream = async () => {
      setStatus("loading")
      try {
        const verification = await verifyChannel.mutateAsync({ channelId: channel.id })
        
        if (!mounted) return
        
        if (!verification.available) {
          setStatus("error")
          setErrorMessage(verification.error || "Stream is currently unavailable.")
          return
        }
        
        setNativeCaptions(verification.nativeCaptions || [])
        
        // Setup HLS
        setupHls(channel.streamUrl)
      } catch (err) {
        if (!mounted) return
        setStatus("error")
        setErrorMessage("Failed to verify stream.")
      }
    }
    
    initStream()
    
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.id])

  const setupHls = (url: string) => {
    const video = videoRef.current
    if (!video) return

    if (Hls.isSupported()) {
      if (hlsRef.current) {
        hlsRef.current.destroy()
      }
      
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90
      })
      
      hlsRef.current = hls
      hls.loadSource(url)
      hls.attachMedia(video)
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setStatus("playing")
        video.play().catch(e => console.error("Auto-play prevented", e))
      })
      
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setStatus("buffering")
              hls.startLoad()
              break
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError()
              break
            default:
              setStatus("error")
              setErrorMessage("A fatal playback error occurred.")
              hls.destroy()
              break
          }
        }
      })
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari fallback
      video.src = url
      video.addEventListener("loadedmetadata", () => {
        setStatus("playing")
        video.play().catch(e => console.error("Auto-play prevented", e))
      })
      video.addEventListener("error", () => {
        setStatus("error")
        setErrorMessage("Playback error occurred.")
      })
    }
  }

  // Cleanup on unmount or close
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
      }
      if (sessionId) {
        stopCaptionSession(sessionId).catch(console.error)
      }
    }
  }, [sessionId])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    for (const track of Array.from(video.textTracks)) track.mode = "disabled"
    if (selectedNativeTrack === "none") {
      if (hlsRef.current) hlsRef.current.subtitleTrack = -1
      return
    }
    const selected = nativeCaptions.find((track) => track.id === selectedNativeTrack)
    if (!selected) return
    if (hlsRef.current) {
      const index = hlsRef.current.subtitleTracks.findIndex((track) =>
        track.name === selected.label || track.lang === selected.language
      )
      hlsRef.current.subtitleTrack = index
    }
    const native = Array.from(video.textTracks).find((track) =>
      track.label === selected.label || track.language === selected.language
    )
    if (native) native.mode = "showing"
  }, [selectedNativeTrack, nativeCaptions])

  // Track video time
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    
    const onTimeUpdate = () => {
      setCurrentTimeMs(video.currentTime * 1000)
    }
    
    video.addEventListener('timeupdate', onTimeUpdate)
    return () => video.removeEventListener('timeupdate', onTimeUpdate)
  }, [])

  // Auto-scroll transcript
  useEffect(() => {
    if (showTranscript && cues && cues.length > 0) {
      transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [cues, showTranscript])

  const handleRefresh = useCallback(() => {
    if (hlsRef.current && channel.streamUrl) {
      setStatus("loading")
      hlsRef.current.loadSource(channel.streamUrl)
      hlsRef.current.startLoad()
    }
  }, [channel.streamUrl])

  const togglePlay = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play()
        setIsPlaying(true)
      } else {
        videoRef.current.pause()
        setIsPlaying(false)
      }
    }
  }

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }

  const handleVolumeChange = (val: number) => {
    setVolume(val)
    if (videoRef.current) {
      videoRef.current.volume = val
      if (val > 0 && isMuted) {
        setIsMuted(false)
        videoRef.current.muted = false
      }
    }
  }

  const toggleFullscreen = async () => {
    if (!containerRef.current) return
    
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen()
      setIsFullscreen(true)
    } else {
      await document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isFullscreen) {
        onClose()
      } else if (e.key === " " || e.key === "k") {
        togglePlay()
        e.preventDefault()
      } else if (e.key === "m") {
        toggleMute()
        e.preventDefault()
      } else if (e.key === "f") {
        toggleFullscreen()
        e.preventDefault()
      } else if (e.key === "c") {
        setShowCCMenu(prev => !prev)
        e.preventDefault()
      } else if (e.key === "t") {
        setShowTranscript(prev => !prev)
        e.preventDefault()
      }
    }
    
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullscreen, onClose])

  // AI Captions Toggle
  const toggleAiCaptions = async (enabled: boolean) => {
    setAiCaptionsEnabled(enabled)
    
    if (enabled && !sessionId) {
      try {
        const res = await startCaptionSessionMutation.mutateAsync({
          data: {
            channelId: channel.id,
            streamUrl: channel.streamUrl,
            language: aiLanguage
          }
        })
        setSessionId(res.id)
      } catch (err) {
        console.error("Failed to start AI captions", err)
        setAiCaptionsEnabled(false)
      }
    } else if (!enabled && sessionId) {
      await stopCaptionSession(sessionId).catch(console.error)
      setSessionId(null)
    }
  }

  // Update AI language
  const handleAiLanguageChange = async (lang: string) => {
    setAiLanguage(lang)
    if (aiCaptionsEnabled && sessionId) {
      // Restart session with new language
      await stopCaptionSession(sessionId).catch(console.error)
      const res = await startCaptionSessionMutation.mutateAsync({
        data: {
          channelId: channel.id,
          streamUrl: channel.streamUrl,
          language: lang
        }
      })
      setSessionId(res.id)
    }
  }

  // Find active cue for video overlay
  // Heuristic: If it's a live stream, the `currentTimeMs` might just track time since page load,
  // but AI caption `startMs` tracks time since session start.
  // Instead of strict sync, we just show the most recent cue that hasn't expired yet
  const latestCue = cues?.length ? cues[cues.length - 1] : null

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-lg flex flex-col md:flex-row items-center justify-center gap-0 p-3 md:p-8 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label={`Live stream of ${channel.name}`}
    >
      {/* Main Video Area */}
      <div 
        ref={containerRef} 
        className={cn(
          "relative bg-black flex flex-col justify-center overflow-hidden border border-white/10 shadow-[0_40px_100px_rgba(0,0,0,.72)]",
          isFullscreen ? "h-screen w-screen" : "w-full max-w-[1180px] aspect-video rounded-[22px]"
        )}
      >
        {status === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10 bg-black/60">
            <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden="true" />
            <p className="text-white/80 font-medium">Tuning into {channel.name}...</p>
          </div>
        )}
        
        {(status === "error" || status === "buffering") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10 bg-black/80">
            {status === "error" ? (
              <>
                <AlertCircle className="h-12 w-12 text-destructive" aria-hidden="true" />
                <p className="text-white font-medium">{errorMessage}</p>
                <Button onClick={handleRefresh} variant="outline" className="mt-2 text-white border-white/20 hover:bg-white/10">
                  Try Again
                </Button>
              </>
            ) : (
              <>
                <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden="true" />
                <p className="text-white/80 font-medium">Buffering...</p>
              </>
            )}
          </div>
        )}

        <video
          ref={videoRef}
          className="w-full h-full object-contain rounded-[22px]"
          playsInline
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onClick={togglePlay}
          aria-label="Video player"
        />
        
        {/* Synchronized Caption Overlay */}
        {aiCaptionsEnabled && latestCue && (
          <div className="absolute bottom-24 left-0 right-0 flex justify-center pointer-events-none z-10 px-8">
            <div className="bg-black/70 backdrop-blur-md px-6 py-3 rounded-lg max-w-3xl text-center shadow-2xl border border-white/10">
              <p className="text-white text-xl md:text-2xl font-medium drop-shadow-md leading-relaxed">
                {latestCue.text}
              </p>
            </div>
          </div>
        )}

        <PlayerControls
          isPlaying={isPlaying}
          onTogglePlay={togglePlay}
          volume={volume}
          onVolumeChange={handleVolumeChange}
          isMuted={isMuted}
          onToggleMute={toggleMute}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          showCCMenu={showCCMenu}
          onToggleCCMenu={() => setShowCCMenu(!showCCMenu)}
          onClose={onClose}
          onRefresh={handleRefresh}
          isLive={true}
          showTranscript={showTranscript}
          onToggleTranscript={() => setShowTranscript(!showTranscript)}
        />
        
        {/* CC Menu Overlay */}
        {showCCMenu && (
          <div className="absolute bottom-24 right-4 md:right-24 w-80 bg-background/95 backdrop-blur-xl border border-border/50 rounded-xl p-5 shadow-2xl z-30 animate-in slide-in-from-bottom-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-white">Captions & Subtitles</h3>
              <Button variant="ghost" size="iconSm" onClick={() => setShowCCMenu(false)} aria-label="Close CC Menu">
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            
            <div className="space-y-6">
              {nativeCaptions.length > 0 && (
                <div className="space-y-3">
                  <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider" id="native-tracks-label">Native Tracks</label>
                  <Select value={selectedNativeTrack} onValueChange={setSelectedNativeTrack}>
                    <SelectTrigger className="bg-card text-white border-white/10" aria-labelledby="native-tracks-label">
                      <SelectValue placeholder="Select track" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {nativeCaptions.map(track => (
                        <SelectItem key={track.id} value={track.id}>{track.label || track.language}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase text-white tracking-wider flex items-center gap-2" htmlFor="ai-captions-switch">
                    AI Captions
                    <div className="h-2 w-2 rounded-full bg-primary animate-pulse" aria-hidden="true" />
                  </label>
                  <Switch 
                    id="ai-captions-switch"
                    checked={aiCaptionsEnabled} 
                    onCheckedChange={toggleAiCaptions} 
                    aria-label="Toggle AI Captions"
                  />
                </div>
                
                {aiCaptionsEnabled && (
                  <div className="animate-in fade-in slide-in-from-top-2 pt-2 space-y-3">
                    <Select value={aiLanguage} onValueChange={handleAiLanguageChange}>
                      <SelectTrigger className="bg-card text-white border-white/10" aria-label="AI Captions Language">
                        <SelectValue placeholder="Select language" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto-detect</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="es">Spanish</SelectItem>
                        <SelectItem value="fr">French</SelectItem>
                        <SelectItem value="de">German</SelectItem>
                        <SelectItem value="ja">Japanese</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    {session && (
                      <div className="text-xs text-muted-foreground bg-card p-3 rounded-md border border-white/5 flex items-center gap-2" aria-live="polite">
                        {session.status === "starting" && <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />}
                        {session.status === "listening" && <div className="h-1.5 w-1.5 rounded-full bg-green-500" aria-hidden="true" />}
                        {session.status === "error" && <AlertCircle className="h-3 w-3 text-destructive" aria-hidden="true" />}
                        <span className="capitalize">{session.status}</span>
                        {session.detectedLanguage && <span className="ml-auto opacity-70">Detected: {session.detectedLanguage}</span>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Transcript Panel */}
      {showTranscript && !isFullscreen && (
          <div className="w-full md:w-[350px] lg:w-[400px] h-[40vh] md:h-[min(66.4vw,664px)] bg-card border border-white/10 border-t-0 md:border-t md:border-l-0 flex flex-col z-20 rounded-b-[22px] md:rounded-b-none md:rounded-r-[22px] overflow-hidden">
          <div className="p-4 border-b border-border/50 flex justify-between items-center bg-background/50">
            <h3 className="font-semibold flex items-center gap-2 text-white">
              <MessageSquareText className="h-4 w-4 text-primary" aria-hidden="true" />
              Live Transcript
            </h3>
            <Button variant="ghost" size="iconSm" onClick={() => setShowTranscript(false)} aria-label="Close Transcript">
              <X className="h-4 w-4 text-white" aria-hidden="true" />
            </Button>
          </div>
          
          <ScrollArea className="flex-1 p-4">
            {!aiCaptionsEnabled ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground space-y-4">
                <MessageSquareText className="h-10 w-10 opacity-20" aria-hidden="true" />
                <p>Enable AI Captions to view the live transcript.</p>
                <Button variant="outline" size="sm" onClick={() => {
                  setShowCCMenu(true)
                  setShowTranscript(false)
                }}>
                  Open Caption Settings
                </Button>
              </div>
            ) : cues && cues.length > 0 ? (
              <div className="space-y-4">
                {cues.map(cue => (
                  <div key={cue.id} className={cn(
                    "p-3 rounded-lg text-sm leading-relaxed transition-colors",
                    cue.final ? "bg-background/50 text-foreground" : "bg-primary/5 text-primary"
                  )}>
                    <div className="text-[10px] text-muted-foreground mb-1 font-mono">
                      {new Date(cue.startMs).toISOString().substr(14, 5)}
                    </div>
                    {cue.text}
                  </div>
                ))}
                <div ref={transcriptEndRef} />
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground space-y-4">
                <Loader2 className="h-6 w-6 animate-spin opacity-50" aria-hidden="true" />
                <p>Listening for speech...</p>
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  )
}
