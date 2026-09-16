import * as React from "react"
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, ClosedCaption, Settings, RefreshCw, X, MessageSquareText } from "lucide-react"
import { Button } from "./ui/button"
import { Slider } from "./ui/slider"
import { cn } from "@/lib/utils"

export interface PlayerControlsProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  volume: number;
  onVolumeChange: (val: number) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  showCCMenu: boolean;
  onToggleCCMenu: () => void;
  onClose: () => void;
  onRefresh: () => void;
  isLive: boolean;
  showTranscript: boolean;
  onToggleTranscript: () => void;
}

export function PlayerControls({
  isPlaying,
  onTogglePlay,
  volume,
  onVolumeChange,
  isMuted,
  onToggleMute,
  isFullscreen,
  onToggleFullscreen,
  showCCMenu,
  onToggleCCMenu,
  onClose,
  onRefresh,
  isLive,
  showTranscript,
  onToggleTranscript
}: PlayerControlsProps) {
  return (
    <div className="absolute inset-0 flex flex-col justify-between p-4 pointer-events-none z-20">
      {/* Top Bar */}
      <div className="flex justify-between items-start pointer-events-auto">
        <div className="flex gap-2">
          {isLive && (
            <div className="bg-red-600/90 text-white text-xs font-bold px-3 py-1.5 rounded-md uppercase tracking-widest flex items-center gap-2 backdrop-blur-md" aria-label="Live Stream">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
              </span>
              Live
            </div>
          )}
        </div>
        
        <div className="flex gap-2">
          <Button variant="player" size="icon" onClick={onRefresh} aria-label="Refresh stream" title="Refresh stream">
            <RefreshCw className="h-5 w-5" aria-hidden="true" />
          </Button>
          <Button variant="player" size="icon" onClick={onClose} aria-label="Close player" title="Close player">
            <X className="h-6 w-6" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="bg-gradient-to-t from-black/90 via-black/40 to-transparent -mx-4 -mb-4 p-6 pt-12 flex flex-col gap-4 pointer-events-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="player" 
              size="icon" 
              onClick={onTogglePlay} 
              aria-label={isPlaying ? "Pause" : "Play"}
              className="h-12 w-12 rounded-full border-none bg-primary hover:bg-primary/90 shadow-[0_0_15px_rgba(255,107,0,0.5)]"
            >
              {isPlaying ? <Pause className="h-6 w-6 text-white" aria-hidden="true" /> : <Play className="h-6 w-6 text-white ml-1" aria-hidden="true" />}
            </Button>
            
            <div className="flex items-center gap-2 group">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={onToggleMute} 
                aria-label={isMuted || volume === 0 ? "Unmute" : "Mute"}
                className="text-white hover:bg-white/10"
              >
                {isMuted || volume === 0 ? <VolumeX className="h-5 w-5" aria-hidden="true" /> : <Volume2 className="h-5 w-5" aria-hidden="true" />}
              </Button>
              <div className="w-0 overflow-hidden group-hover:w-24 transition-all duration-300 ease-in-out">
                <Slider
                  value={[isMuted ? 0 : volume]}
                  max={1}
                  step={0.01}
                  onValueChange={(vals) => onVolumeChange(vals[0])}
                  className="w-20"
                  aria-label="Volume Control"
                />
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Button
              variant="player"
              size="icon"
              onClick={onToggleCCMenu}
              aria-label="Captions and Subtitles Settings"
              aria-expanded={showCCMenu}
              className={cn(showCCMenu && "bg-primary text-white border-primary")}
              title="Captions & Subtitles"
            >
              <ClosedCaption className="h-5 w-5" aria-hidden="true" />
            </Button>

            <Button
              variant="player"
              size="icon"
              onClick={onToggleTranscript}
              aria-label="Toggle Transcript Panel"
              aria-expanded={showTranscript}
              className={cn(showTranscript && "bg-primary text-white border-primary")}
              title="Show Transcript Panel"
            >
              <MessageSquareText className="h-5 w-5" aria-hidden="true" />
            </Button>

            <Button variant="player" size="icon" aria-label="Settings" title="Settings">
              <Settings className="h-5 w-5" aria-hidden="true" />
            </Button>

            <Button 
              variant="player" 
              size="icon" 
              onClick={onToggleFullscreen} 
              aria-label={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
              title="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize className="h-5 w-5" aria-hidden="true" /> : <Maximize className="h-5 w-5" aria-hidden="true" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
