# Work-Spec: Implementation Plan for WI-014

## 1. Target Files

- **Production files:**
  - `src/domain/voice/voice-command.ts` — add a wake-word-gated parse (e.g.
    `parseWakeCommand(transcript, language)`) that returns `unknown` unless the transcript
    begins with a wake word, then parses the remainder. Reuses the existing grammar/keywords.
  - `src/voice-listener/main.ts` — add a continuous-receive loop behind the flag: subscribe to
    each speaker (`receiver.speaking` / per-user `subscribe`), transcribe each utterance, apply
    the wake-word gate, forward on a hit, and debounce.
  - `src/infrastructure/voice/discord-voice-listener.ts` — a streaming/continuous capture mode
    alongside the current single-shot `capture` (or a sibling method).
  - `src/config/env.ts` — `VOICE_WAKE_WORD_ENABLED` (default false) and `VOICE_WAKE_WORD`.
- **Test files:**
  - `tests/unit/domain/voice-command.test.ts` — wake-word-gated parsing (hit vs no wake word
    vs bare wake word), per language.
  - `tests/unit/config/env.test.ts` — the new flag and wake-word defaults/validation.
  - The continuous-receive wiring in the listener is validated via `typecheck:voice` /
    `build:voice`, consistent with the rest of the receive infrastructure.

## 2. Proposed Technical Approach

Keep the main bot and its IPC endpoint untouched — WI-014 is entirely inside the listener plus
a small domain helper. When the flag is on, the listener joins the channel and stays. For each
speaker it opens an `AfterSilence` per-utterance stream, decodes to PCM, and transcribes with
Vosk exactly as WI-013 does, but instead of a slash reply it applies `parseWakeCommand`: only
utterances beginning with the wake word produce an intent, which is forwarded over the existing
authenticated IPC. Everything else is dropped and the audio discarded.

Trade-offs to settle in implementation: continuous Vosk means transcribing all speech in the
channel to spot the wake word — acceptable in the isolated listener process for a small private
server, but it is the core privacy/CPU cost and must be documented and opt-in. A debounce
(per-user cooldown) avoids double-firing. Feedback has no interaction to reply to, so a short
transient message or a reaction is used. The wake word must be recognizable by the model; the
grammar may need the chosen wake word added, or a dedicated engine adopted later.

## 3. Testing Strategy (TDD)

- **Red:** Domain tests assert `parseWakeCommand("dijay skip", "en")` → skip, `"skip"` (no wake
  word) → unknown, and bare `"dijay"` → unknown; config tests assert the flag default and
  wake-word parsing.
- **Green:** Implement the wake-word gate and the flag; wire the continuous-receive loop.
- **Refactor:** Keep the domain unaware of audio, reuse WI-012/WI-013 STT and IPC unchanged,
  document the privacy/CPU trade-off and wake-word setup, and run all gates
  (`typecheck`, `typecheck:voice`, `lint`, `test`, `build`, `build:voice`).

## Open Decisions

- Vosk keyword-spotting (this plan) vs a dedicated wake-word engine (openWakeWord / Porcupine)
  if the wake word is not reliably recognized.
- Feedback mechanism and per-user cooldown window.
- Whether continuous receive replaces or coexists with the push-to-talk `/listen` command.
