---
name: English live captions
description: English-only caption output and translation behavior
---
The user wants live closed captions translated and displayed in English, not an English hint passed to speech recognition.

**Why:** Forcing speech recognition to English misrecognizes non-English broadcasts rather than translating them. Preserve existing English captions; auto-detect other speech languages before translation. ElevenLabs uses three-letter language codes such as `eng`, not only `en`.

**How to apply:** Keep AI transcription/translation opt-in because it uses paid services. Native English tracks are usable directly. Do not silently show untranslated source text when translation fails. Chunk-based live captions have latency; describe them as delayed rather than claiming frame-accurate synchronization.

For browser regressions, use continuous, local speech media and control when the test speech provider releases each result rather than delaying HLS segment downloads.

**Why:** Public streams failed browser playback; repeated transport segments and network pacing made finalized audio chunks unreliable. Provider gates isolate cue expiry and pause behavior without bypassing real video playback, FFmpeg capture, or session cleanup. This validates integration behavior, not speech-provider accuracy.

**How to apply:** Keep paid-provider quality checks separate. Use the environment's system Chromium when bundled Playwright Chromium lacks shared libraries.