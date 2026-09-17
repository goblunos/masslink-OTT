import catalog from './channel-catalog.json';

export type Channel = {
  id: string;
  name: string;
  displayName: string;
  logo: string;
  country: string;
  group: string;
  url: string;
};

// The catalog is built offline, not scanned or changed by viewers.
export const VERIFIED_CHANNELS: Channel[] = catalog.channels;