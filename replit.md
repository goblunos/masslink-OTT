# Masslink OTT

A global live-TV web app with verified HLS playback, native captions, and opt-in backend AI live subtitles.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/masslink-tv run dev` — run the web viewer through its managed workflow
- `pnpm --filter @workspace/api-server test` — playback and caption lifecycle tests
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- ElevenLabs is accessed through the connected Replit integration; caption tuning is documented in `MASSLINK_SETUP.md`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- Web viewer: `artifacts/masslink-tv`
- Channel and caption API: `artifacts/api-server/src/routes`
- Trusted channel catalog: `artifacts/api-server/src/lib/channel-catalog.ts`
- Caption session manager: `artifacts/api-server/src/lib/caption-sessions.ts`
- API contract: `lib/api-spec/openapi.yaml`

## Architecture decisions

- AI captions are opt-in and short-lived; no transcription starts before CC is enabled.
- Native HLS tracks take priority over AI captions.
- The backend resolves stream URLs from the trusted catalog to prevent SSRF.
- Caption audio and cues are ephemeral, bounded, and removed when a session stops.

## Product

Search and filter global channels, preview verified streams, play HLS in a modal, select native captions, or enable AI live captions with language detection and a transcript.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Replace sample HLS entries with licensed streams before public launch.
- Keep caption cleanup tied to CC disable, player close, stream changes, and expiry.
- See `MASSLINK_SETUP.md` for rate limits, concurrency, and provider fallback.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
