import React, { useState } from "react"
import { Search, Globe2, AlertCircle, RefreshCw } from "lucide-react"
import { useListChannels } from "@workspace/api-client-react"
import { ChannelCard } from "./channel-card"
import { Input } from "./ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { Button } from "./ui/button"
import type { Channel } from "@workspace/api-client-react"

interface ChannelGridProps {
  onPlayChannel: (channel: Channel) => void;
}

export function ChannelGrid({ onPlayChannel }: ChannelGridProps) {
  const [search, setSearch] = useState("")
  const [country, setCountry] = useState("all")
  const [visibleCount, setVisibleCount] = useState(8)
  
  // Debounce search slightly
  const [debouncedSearch, setDebouncedSearch] = useState("")
  
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 500)
    return () => clearTimeout(timer)
  }, [search])

  React.useEffect(() => setVisibleCount(8), [debouncedSearch, country])

  const params = {
    search: debouncedSearch || undefined,
    country: country !== "all" ? country : undefined,
  }

  const { data: channels, isLoading, error, refetch } = useListChannels(params)

  const countries = React.useMemo(() => {
    // We would ideally extract this from all possible channels, but for now we just show a static list or extract from current data
    return [
      { code: "all", name: "All Countries" },
      { code: "us", name: "United States" },
      { code: "gb", name: "United Kingdom" },
      { code: "jp", name: "Japan" },
      { code: "kr", name: "South Korea" },
      { code: "fr", name: "France" },
      { code: "de", name: "Germany" },
      { code: "br", name: "Brazil" },
      { code: "in", name: "India" },
      { code: "au", name: "Australia" },
    ]
  }, [])

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1400px] mx-auto pb-20 pt-6">
      
      {/* Hero / Filter Section */}
      <div className="bg-card/40 border border-border/50 rounded-2xl p-6 backdrop-blur-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[100px] pointer-events-none transform translate-x-1/2 -translate-y-1/2" />
        
        <div className="flex flex-col md:flex-row gap-4 relative z-10">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input 
              placeholder="Search channels, networks, or categories..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-11 h-12 bg-background border-border/60 focus-visible:ring-primary shadow-inner text-base"
            />
          </div>
          
          <div className="w-full md:w-64">
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger className="h-12 bg-background border-border/60">
                <div className="flex items-center gap-2">
                  <Globe2 className="h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="All Countries" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {countries.map(c => (
                  <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Grid Status & Content */}
      <div className="flex justify-between items-end mb-2 gap-4">
        <h2 className="text-xl font-semibold tracking-tight">
          {debouncedSearch ? "Search Results" : "Live Channels"}
          {channels && <span className="ml-3 text-sm font-normal text-muted-foreground">{channels.length} channels available</span>}
        </h2>
        <Button variant="ghost" size="sm" onClick={() => refetch()} aria-label="Refresh channel directory">
          <RefreshCw className="h-4 w-4 mr-2" aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-card border border-border/30 overflow-hidden h-[280px] animate-pulse flex flex-col">
              <div className="aspect-video bg-background/50" />
              <div className="p-4 flex-1 flex flex-col gap-3">
                <div className="h-5 bg-background/50 rounded-md w-3/4" />
                <div className="h-4 bg-background/50 rounded-md w-1/2 mt-auto" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-card/30 rounded-xl border border-border/50">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h3 className="text-lg font-semibold mb-2">Failed to load channels</h3>
          <p className="text-muted-foreground mb-6 max-w-md">There was a problem connecting to the channel directory. Please try again later.</p>
          <Button onClick={() => refetch()} variant="outline">Try Again</Button>
        </div>
      ) : channels?.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-20 text-center bg-card/20 rounded-xl border border-border/30 border-dashed">
          <Search className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-xl font-medium mb-2">No channels found</h3>
          <p className="text-muted-foreground max-w-md">We couldn't find any channels matching your search criteria. Try adjusting your filters.</p>
          {(search || country !== 'all') && (
            <Button 
              variant="link" 
              className="mt-4 text-primary" 
              onClick={() => { setSearch(""); setCountry("all"); }}
            >
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
          {channels?.slice(0, visibleCount).map(channel => (
            <ChannelCard 
              key={channel.id} 
              channel={channel} 
              onClick={onPlayChannel} 
            />
          ))}
          {channels && visibleCount < channels.length && (
            <div className="col-span-full flex justify-center pt-6">
              <Button onClick={() => setVisibleCount((count) => count + 8)} size="lg">
                Load more channels
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
