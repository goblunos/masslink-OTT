// Offline catalog maintenance only; never run by the viewer's browser.
import { writeFile } from 'node:fs/promises';
const source = 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8';
const origin = `https://${process.env.REPLIT_DEV_DOMAIN || 'masslink.example'}`;
const names = new Intl.DisplayNames(['en'], { type: 'region' });
const playlist = await (await fetch(source)).text();
const lines = playlist.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
const candidates = [];
for (let i = 0; i < lines.length; i++) {
  if (!lines[i].startsWith('#EXTINF:')) continue;
  const attrs = Object.fromEntries([...lines[i].matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
  let j = i + 1;
  while (lines[j]?.startsWith('#')) j++;
  const url = lines[j] || '';
  if (!/^https:\/\/.*\.m3u8(?:[?#]|$)/i.test(url)) continue;
  const name = (attrs['tvg-name'] || lines[i].slice(lines[i].indexOf(',') + 1)).replace(/[ⓈⓉⓎⒼ]/g, '').trim();
  const code = (attrs['tvg-country'] || attrs['tvg-id']?.split('.').at(-1) || '').toUpperCase();
  let country = 'International';
  if (/^[A-Z]{2}$/.test(code)) country = names.of(code === 'UK' ? 'GB' : code) || code;
  candidates.push({ id: attrs['tvg-id'] || `channel-${i}`, name, displayName: name, logo: attrs['tvg-logo'] || '', country, group: attrs['group-title'] || 'Live TV', url });
}
async function request(url, media = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    if (!url.startsWith('https://')) throw Error('Non-HTTPS');
    const r = await fetch(url, { signal: controller.signal, headers: { Origin: origin, ...(media ? { Range: 'bytes=0-2047' } : {}) } });
    const cors = r.headers.get('access-control-allow-origin');
    if (!r.ok || !r.url.startsWith('https://') || (cors !== '*' && cors !== origin)) {
      await r.body?.cancel();
      throw Error('HTTP/CORS');
    }
    if (media) {
      const reader = r.body?.getReader();
      const chunk = await reader?.read();
      await reader?.cancel();
      if (!chunk?.value?.length || /text\/html|application\/json/.test(r.headers.get('content-type') || '')) throw Error('No media');
      return { text: '', url: r.url };
    }
    const text = await r.text();
    if (!text.trimStart().startsWith('#EXTM3U')) throw Error('Not HLS');
    return { text, url: r.url };
  } finally { clearTimeout(timer); }
}
async function verify(ch) {
  try {
    let manifest = await request(ch.url);
    for (let depth = 0; depth < 4; depth++) {
      const rows = manifest.text.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
      const master = rows.findIndex(x => x.startsWith('#EXT-X-STREAM-INF:'));
      if (master >= 0) {
        const variant = rows.slice(master + 1).find(x => !x.startsWith('#'));
        if (!variant) return false;
        manifest = await request(new URL(variant, manifest.url).href);
        continue;
      }
      const media = rows.find(x => !x.startsWith('#'));
      if (!media) return false;
      // Initialization fragments and encryption keys also need browser access.
      for (const row of rows.filter(x => x.startsWith('#EXT-X-MAP:') || x.startsWith('#EXT-X-KEY:'))) {
        const uri = row.match(/URI="([^"]+)"/)?.[1];
        if (uri) await request(new URL(uri, manifest.url).href, true);
      }
      await request(new URL(media, manifest.url).href, true);
      return true;
    }
  } catch { return false; }
  return false;
}
let cursor = 0;
let checked = 0;
const passed = [];
await Promise.all(Array.from({ length: 24 }, async () => {
  while (cursor < candidates.length) {
    const ch = candidates[cursor++];
    if (await verify(ch)) passed.push(ch);
    checked++;
    if (checked % 100 === 0) console.log(`${checked}/${candidates.length} checked; ${passed.length} passed`);
  }
}));
const ids = new Set(), urls = new Set();
const channels = passed.sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name)).filter(ch => {
  if (ids.has(ch.id) || urls.has(ch.url)) return false;
  ids.add(ch.id); urls.add(ch.url); return true;
});
const output = { source, checkedAt: new Date().toISOString(), candidates: candidates.length, channels };
await writeFile('/tmp/verified-tv-catalog.json', JSON.stringify(output, null, 2));
console.log(`Complete: ${channels.length} unique channels passed; results in /tmp/verified-tv-catalog.json`);