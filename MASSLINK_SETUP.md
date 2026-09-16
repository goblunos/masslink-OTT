# Masslink OTT setup

## What runs

- `artifacts/masslink-tv` is the deployable React/Vite viewer.
- `artifacts/api-server` serves the channel catalog, verifies HLS manifests, discovers native subtitle tracks, and owns AI caption sessions.
- AI captions are strictly opt-in. No server audio extraction or transcription starts until the viewer enables CC and chooses AI captions.

## Live caption pipeline

1. The browser first uses native HLS subtitle tracks when the manifest exposes them.
2. For a stream without a usable native track, enabling AI captions creates a short-lived server session.
3. The server resolves the stream from its trusted channel catalog, never from an arbitrary browser-supplied URL.
4. `ffmpeg` extracts mono 16 kHz audio into bounded segments.
5. Completed segments are sent to ElevenLabs Speech-to-Text through the Replit connector.
6. Timestamped cues are polled by the browser, rendered over video, and retained in the transcript panel.
7. Disabling CC, changing streams, closing the player, expiry, or server shutdown terminates processing and removes temporary files.

The connected ElevenLabs integration supplies authentication. Do not add an API key to source code.

## Configuration

These optional environment variables tune operations:

| Variable | Default | Purpose |
| --- | ---: | --- |
| `CAPTION_MAX_CONCURRENT` | `3` | Maximum simultaneous AI caption sessions per server instance |
| `CAPTION_SESSION_TTL_MS` | `1200000` | Hard session lifetime (20 minutes) |
| `CAPTION_CHUNK_SECONDS` | `6` | Audio segment duration; minimum is 3 seconds |
| `CAPTION_STT_MODEL` | `scribe_v1` | ElevenLabs speech-to-text model |
| `LOG_LEVEL` | `info` | Structured server logging level |

The API also limits each client to six caption session starts per minute and replaces an older active session from the same client.

## Channel catalog

The sample catalog is in `artifacts/api-server/src/lib/channel-catalog.ts`. Replace sample entries with licensed HLS sources before launch. Keep server-side catalog resolution in place to prevent SSRF. Ensure providers permit server-side audio extraction and transcription.

## Failure and fallback behavior

- Native caption tracks remain available without AI.
- If capacity is full, the UI reports it and playback continues.
- If a provider call, manifest, or stream audio extraction fails, the session enters reconnecting/error/unsupported state while video remains usable.
- Streams that block server-side access cannot be AI-transcribed; the UI falls back to native captions or no captions.
- Caption cues are best-effort and are not stored in the database.

## Validation

Run:

```bash
pnpm --filter @workspace/api-server test
pnpm run typecheck
```

The automated lifecycle suite checks catalog playback verification, explicit opt-in creation, session cleanup, and rejection of arbitrary stream URLs.