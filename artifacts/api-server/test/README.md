# Caption regression fixture

The browser regression uses `test/fixtures/speech-hls`, a checked-in 72-second
HLS VOD containing continuous real Spanish speech, video, and audio segments.
The fixture is served only by the test harness; it is not added to the trusted
production channel catalog.

Regenerate it after changing the fixture recipe:

```sh
nix-shell -p espeak --run 'pnpm --filter @workspace/api-server test:fixture'
```

`ffmpeg` and `espeak` are required. The script synthesizes an intelligible,
fixed Spanish sentence with espeak and fails explicitly if the speech
generator is missing (for example, install it with `nix-shell -p espeak`).
Speech recognition and translation are mocked at the provider dependency
boundary in `src/test/e2e-server.ts`, while ffmpeg still captures the local
HLS audio into the real caption session pipeline.

The isolated harness serves the checked-in manifest unchanged and exposes
`POST /__test/release/:index` only on its test server. Each mocked transcription
call waits on its matching release index, making cue 0 through cue 3
deterministic without slowing ffmpeg or adding realtime production flags.

Run the existing backend tests:

```sh
pnpm --filter @workspace/api-server test
```

Run the single browser regression (the Playwright config starts a test-only API
and Vite proxy, and owns the local fixture server):

```sh
pnpm --filter @workspace/masslink-ott exec playwright install chromium
pnpm --filter @workspace/masslink-ott test:e2e
```

The test covers Safari-compatible native `TextTrackList` discovery and English
track selection, explicit AI-caption opt-in, absence of a session before
opt-in, native-track shutdown before the translated English overlay appears,
advancing controlled HLS media, translated English overlay and transcript,
exact cue expiry while the session remains alive, no stale overlay replay
after pause, and DELETE cleanup when closing the player. The native track is
injected at the media-element boundary because Playwright's Linux browsers do
not provide Safari's native HLS stack. It intentionally does not validate a
paid speech provider, translation quality, or Apple's HLS decoder.