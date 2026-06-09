# Gemini Persistent Memory

## Critical Engineering Directives (CRITICAL BEHAVIOR GATES)
Every session MUST review and adhere to the architectural and behavioral lessons documented in:
`/.gemini-memory/facts/engineering_failures_and_blindspots.md`

- **Rule 1: Grounding in Reality.** Never claim a build or fix works unless you have compiled, run, and verified it via the shell. Do not produce "aspirational" checklists or hypothetical verification runs.
- **Rule 2: Build the Core First.** Avoid over-engineering (e.g., adding complex UI, Combine pipelines, secondary MCP layers) before the minimal, functional loop operates. Establish the core pipeline first.
- **Rule 3: No Silent Spec Degradation.** Do not swap hard specs (like local Whisper.cpp/Kokoro) for simpler APIs (SFSpeech/AVSpeech) without explicit, up-front technical validation and user consent.
- **Rule 4: Zero Conversational Filler.** Maintain professional, dense, and candid communication. No defensive rationalization.

## Skillsdump Location
skillsdump is located at: `/Volumes/SanDisk1Tb/skillsdump/`

## Project Integrations & Environment State
- **Family Security System Cameras:** Device info resides in `.env`.
- **Tailscale Mesh Network:** Configured and accessible in `.env`.
- **Mission Control Client Status:** Compiles but is fundamentally flawed due to over-engineering and missing the bidirectional LLM-direct-loop client. See `facts/engineering_failures_and_blindspots.md` for details.
