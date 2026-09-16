export type Channel = {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  category: string;
  logo: string;
  streamUrl: string;
  viewers: number;
  featured: boolean;
};

const demo = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

export const channels: Channel[] = [
  ["masslink-news", "Masslink News", "Nigeria", "NG", "News", 18240, true],
  ["lagos-live", "Lagos Live", "Nigeria", "NG", "Local", 9810, true],
  ["africa-now", "Africa Now", "Ghana", "GH", "News", 7540, true],
  ["world-24", "World 24", "United Kingdom", "GB", "News", 12110, true],
  ["metro-sport", "Metro Sport", "United States", "US", "Sports", 21970, true],
  ["pulse-music", "Pulse Music", "South Africa", "ZA", "Music", 6420, false],
  ["europa-one", "Europa One", "France", "FR", "General", 5880, false],
  ["tokyo-view", "Tokyo View", "Japan", "JP", "Culture", 4770, false],
  ["rio-channel", "Rio Channel", "Brazil", "BR", "Entertainment", 8230, false],
  ["mumbai-plus", "Mumbai Plus", "India", "IN", "Entertainment", 10550, false],
  ["toronto-live", "Toronto Live", "Canada", "CA", "General", 3920, false],
  ["berlin-tv", "Berlin TV", "Germany", "DE", "Culture", 3450, false],
].map(([id, name, country, countryCode, category, viewers, featured]) => ({
  id: String(id),
  name: String(name),
  country: String(country),
  countryCode: String(countryCode),
  category: String(category),
  logo: `https://ui-avatars.com/api/?name=${encodeURIComponent(String(name))}&background=17120f&color=f97316&bold=true&format=svg`,
  streamUrl: demo,
  viewers: Number(viewers),
  featured: Boolean(featured),
}));

export function getChannel(id: string): Channel | undefined {
  return channels.find((channel) => channel.id === id);
}