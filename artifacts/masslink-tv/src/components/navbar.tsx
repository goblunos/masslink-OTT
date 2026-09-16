import * as React from "react"
import { useLocation } from "wouter"
import { Search, MonitorPlay, Globe, Settings } from "lucide-react"
import { cn } from "@/lib/utils"

export function Navbar() {
  const [location] = useLocation()
  
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center px-4 md:px-8">
        <div className="flex items-center gap-2 mr-8">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-[0_0_20px_rgba(255,107,0,0.4)]">
            <MonitorPlay className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white hidden sm:inline-block">
            Masslink<span className="text-primary">OTT</span>
          </span>
        </div>
        
        <nav className="flex flex-1 items-center gap-6 text-sm font-medium">
          {/* Navigation links could go here if multi-page */}
        </nav>
      </div>
    </header>
  )
}
