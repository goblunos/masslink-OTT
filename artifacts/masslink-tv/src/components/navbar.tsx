import * as React from "react"
import { MonitorPlay } from "lucide-react"

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 w-full bg-gradient-to-b from-background via-background/95 to-transparent backdrop-blur-md">
      <div className="mx-auto flex h-[72px] max-w-[1600px] items-center px-4 md:px-[22px]">
        <div className="flex items-center gap-3">
          <div className="relative flex h-[42px] w-[42px] items-center justify-center rounded-[13px] bg-gradient-to-br from-primary to-orange-300 shadow-[0_10px_28px_rgba(255,122,24,.22)]">
            <MonitorPlay className="h-5 w-5 text-[#101010]" />
          </div>
          <div>
            <strong className="block text-[15px] font-black tracking-[.04em]">MASSLINK OTT</strong>
            <span className="block text-xs text-muted-foreground">Live television</span>
          </div>
        </div>
      </div>
    </header>
  )
}
