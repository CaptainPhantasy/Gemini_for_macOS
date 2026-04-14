---
title: Gemini for macOS — Implementation Plan v2
id: 07_IMPLEMENTATION_PLAN_V2
project: gemini-for-macos
report_type: implementation-plan
version: 2
supersedes: none (v1 was conversational only, never persisted)
generated_at_local: "2026-04-13 20:02 EDT"
generated_at_timezone: America/Indiana/Indianapolis
generated_at_utc: "2026-04-14 00:02 UTC"
author: Claude Code (senior engineering architect role)
audience: single-user / personal tool / not for distribution
status: READY FOR EXECUTION
---

# Gemini for macOS — Implementation Plan v2

All wall-clock timestamps in **US Indiana Eastern Time** (`America/Indiana/Indianapolis`, EDT / UTC−4).
**Prior doc in the sequence:** `Documents/06_SDK_GROUNDING_REPORT_2026-04-13.md`.
**Scope:** personal tool for Douglas Talley. Not for distribution. Not for packaging until Douglas explicitly requests it after personally using the app.

---

## Change Summary Since v1

The v1 plan (delivered conversationally earlier this session) was written as if this were a distributable product. It is not. This revision reflects the following confirmed decisions:

1. **Personal tool.** Douglas is the only user, the only tester, and the only reviewer. No distribution, no licensing, no customer support surface.
2. **Phase 11 (packaging) explicitly deferred** until Douglas has personally tested a working app and asks for it. Build quality *worthy* of packaging without packaging prematurely. The reward signal is not "a `.dmg` exists"; it is "Douglas wants to keep using this tomorrow."
3. **Test coverage rescoped.** The 80% line-coverage mandate from v1 was a distribution mindset. Replaced with targeted tests only where they save Douglas's time: Live Mode reconnection, OAuth flow, launchd scheduler, MCP bridge handshake.
4. **Plugin manager killed.** `src/lib/plugin-manager.ts` is deleted. Not part of the product thesis.
5. **Cost awareness elevated.** Douglas is paying per token. Dynamic model selection, thinking-budget tuning, token visibility in the UI, and prompt caching are now first-class concerns, not afterthoughts.
6. **Phase 6 uses macOS `launchd`**, not an in-app JavaScript scheduler. Survives app closure. Survives reboots. Native primitive.
7. **Phase 7 Live Mode completely respec'd** against RAGBOT3000's production implementation (not compass's simpler audio-only pattern). Three-button invocation surface (Voice / Camera / Screen), not an always-on modal.
8. **Phase 8 pivots away from the HttpOnly-cookie backend proxy** toward direct-to-Google fetches with bearer tokens, because Douglas already has the Google OAuth project set up and the app is local-only.
9. **Verification gate is Douglas's confirmation, not CI.** No phase is marked complete on my own judgment. I report what changed, what to test, and wait for confirmation before moving on.

---

## A) Requested Items Checklist

- [x] 1. Rewrite the plan document to reflect every decision made since v1
- [x] 2. Preserve the phase structure (0-10) and the Mandatory Execution Contract shape
- [x] 3. Ground every phase in code I have personally read — both in Gemini for macOS and in the reference apps (compass, RAGBOT3000)
- [x] 4. Make the Live Mode phase concrete enough to execute against (three buttons, file-level port list, adaptation list)
- [x] 5. Explicitly defer packaging; forbid the "package prematurely to get reward signal" loop
- [x] 6. Retain every feature Douglas wants, at no-shortcut implementation quality
- [x] 7. Save to the numbered `Documents/` sequence continuing from `06_SDK_GROUNDING_REPORT`

---

## B) Per-Item Evidence Ledger

### Item 1 — Reflects every decision since v1

See Change Summary above. Each of the nine items traces to a specific turn of the conversation. Plan structure below incorporates them all.

### Item 2 — Phase structure + contract shape preserved

Phases 0-10 present. Section A/B/C/D wrapper intact. Hard-gate rule intact.

### Item 3 — Grounded in read code

Evidence sources by app:

**Gemini for macOS (this repo):**
`package.json`, `src/types.ts`, `src/App.tsx`, `src/lib/storage.ts`, `src/lib/api-config.ts`, `src/lib/mcp.ts`, `src/lib/multimodal.ts`, `src/lib/integrations.ts`, `src/lib/oauth-handler.ts`, `src/lib/plugin-manager.ts`, `src/components/Settings.tsx`, `src/components/LiveMode.tsx`, `src/components/ScheduledActions.tsx`, `src/components/Canvas.tsx`, `index.html`, `metadata.json`.

**Compass (`/Volumes/Storage/ELDERCAE APP/compass/`):**
`src/hooks/useVoiceAgent.ts`, `src/hooks/useCameraStream.ts`, `src/hooks/useMedicationScanner.ts`, `src/hooks/useMemoryTidier.ts`, `src/services/geminiService.ts`, `src/features/elder/VideoPage.tsx`.

**RAGBOT3000 (`/Volumes/Storage/RAGBOT3000/atlas-rag-teammate/`):**
`services/liveService.ts`, `hooks/useMediaStream.ts`.

### Item 4 — Live Mode is concrete

Phase 7 lists exact files to port, exact adaptations to make, exact button specs, exact session panel layouts.

### Item 5 — Packaging deferred

Phase 11 is explicitly marked NOT ON THE ROADMAP. A separate section documents the "don't package for reward signal" anti-pattern and how execution will avoid it.

### Item 6 — Full feature scope preserved

Every feature observed in the codebase is covered: chat, Canvas AI actions, Gems, Personal Intelligence, Artifact Library, Search, Command Palette, Scheduled Actions, Live Mode (three buttons), Google Integrations (direct-to-Google after OAuth), MCP command execution, dynamic model selection with "Redo with Pro," token visibility, keyboard shortcuts.

### Item 7 — Save location

`Documents/07_IMPLEMENTATION_PLAN_V2_2026-04-13.md`, continuing the numbered prefix convention (`01_*` through `06_*` already present).

---

## C) Verification Receipts (Code Read That Grounds This Plan)

| Source | Path | Read Scope | What It Grounds |
|---|---|---|---|
| Gemini for macOS | `package.json` | full | SDK version, deps, current scripts |
| Gemini for macOS | `src/types.ts` | full | AppSettings has no `model` field |
| Gemini for macOS | `src/App.tsx` | full | compile drift L257-258; `handleSendMessage` L153-228; `response.text` ternary L191 |
| Gemini for macOS | `src/lib/storage.ts` | full | silent-fail pattern; `yolo` default; `/data/*.json` prefix |
| Gemini for macOS | `src/lib/api-config.ts` | full | `process.env` fallback broken in browser |
| Gemini for macOS | `src/lib/mcp.ts` | full | WebSocket client; silent connect failure; custom `mcp/configure_servers` method |
| Gemini for macOS | `src/lib/multimodal.ts` | full | 7 hardcoded model literals; dead synth_id block L96-117 |
| Gemini for macOS | `src/lib/integrations.ts` | full | NotebookLM/Drive/Docs/Travel impls; 100% orphaned |
| Gemini for macOS | `src/lib/oauth-handler.ts` | full | backend OAuth flow; 100% orphaned |
| Gemini for macOS | `src/lib/plugin-manager.ts` | full | 14-line stub; slated for deletion |
| Gemini for macOS | `src/components/Settings.tsx` | full | no model selector; has autonomy/theme/MCP editor |
| Gemini for macOS | `src/components/LiveMode.tsx` | full | WebRTC mirror, never reaches Gemini |
| Gemini for macOS | `src/components/ScheduledActions.tsx` | full | persist-only, no scheduler |
| Gemini for macOS | `src/components/Canvas.tsx` | full | Magic Wand AI actions at L78-100 |
| Compass | `src/hooks/useVoiceAgent.ts` | full | clean Gemini Live audio pattern |
| Compass | `src/hooks/useCameraStream.ts` | full | camera constraints + continuous focus trick |
| Compass | `src/hooks/useMedicationScanner.ts` | full | frame-capture → vision → TTS flow |
| Compass | `src/hooks/useMemoryTidier.ts` | full | structured output via `responseSchema` |
| Compass | `src/services/geminiService.ts` | full | **confirms `response.text` is a property**; thinking budget pattern; TTS extraction path |
| RAGBOT3000 | `services/liveService.ts` | full | **production LiveSession class** with state machine, barge-in, reconnection, source-agnostic video pump |
| RAGBOT3000 | `hooks/useMediaStream.ts` | full | dual-source orchestrator (`'camera' \| 'screen'`); error mapping; facing-mode toggle |
| Grounding | `Documents/06_SDK_GROUNDING_REPORT_2026-04-13.md` | this session | model ID currency, SDK version (1.29→1.48+) |

---

## D) Completeness Matrix

| Requested Item | Status | Evidence |
|---|---|---|
| Plan rewritten for personal-tool framing | COMPLETE | Change Summary; Phases 1-10 adjusted; Phase 11 deferred |
| Phase structure preserved | COMPLETE | Phases 0-10 present, contract wrapper intact |
| Code-grounded | COMPLETE | Section C, 22 files cited |
| Live Mode concrete | COMPLETE | Phase 7 file-level port list + three-button spec |
| Packaging deferred | COMPLETE | Phase 11 section flagged NOT ON ROADMAP |
| Full feature scope | COMPLETE | Every observed feature mapped to a phase |
| Saved in Documents sequence | COMPLETE | `Documents/07_IMPLEMENTATION_PLAN_V2_2026-04-13.md` |

**Hard-gate result:** PASS.

---

# THE PLAN

## Guiding Principles

1. **Verification gate is Douglas's confirmation.** No phase is marked complete until Douglas personally tests it and says it works. Tests are necessary but not sufficient. `tsc --noEmit` passing does not mean the feature works.

2. **Loud-fail over silent-fail.** Every error surface gets a toast, a console error, and a reproducible failure path. Swallowed errors are banned. When something breaks, Douglas should see it break, not discover it later through missing data.

3. **Cost awareness is a feature, not a cleanup pass.** Every Gemini call should be attributable, every model choice should be deliberate, every thinking budget should match the task. Token visibility lands in the UI in an early phase, not at the end.

4. **No premature packaging.** The app runs via `npm run dev:all` for as long as it takes. Packaging is a reward Douglas grants the app, not a checkbox the agent chases.

5. **Port working code over reinvention.** RAGBOT3000 has a production Live Mode. Compass has a production vision + TTS flow. When the reference code works, port it verbatim with targeted adaptations. Do not "improve" working code unless Douglas asks.

6. **One MCP server for v1.** Desktop Commander. Multi-server multiplexing deferred.

7. **TypeScript strict mode. Zod at boundaries. No `process.env.X` in browser code.** Non-negotiable.

---

## Phase 0 — Prerequisite Inventory

**Objective:** Close every gap in current-state knowledge so the rest of the plan runs on evidence, not assumption.

**Evidence anchoring:** Section C lists files read this session. The following files were **not** read and must be before any code work:
`src/components/Chat.tsx`, `src/components/Sidebar.tsx`, `src/components/CommandPalette.tsx`, `src/components/ArtifactLibrary.tsx`, `src/components/GemsRegistry.tsx`, `src/components/PersonalIntelligence.tsx`, `src/components/Search.tsx`, `src/components/MCPPermissionModal.tsx`, `src/components/SafeMarkdown.tsx`, `src/components/Help.tsx`, `src/components/SplashScreen.tsx`, `src/components/ShortcutEditor.tsx`, `src/components/Toast.tsx`, `src/lib/autosave.ts`, `src/lib/backup.ts`, `src/lib/clipboard.ts`, `src/lib/export.ts`, `src/lib/json-validation.ts`, `src/lib/macro-manager.ts`, `src/lib/security.ts`, `src/lib/sharing.ts`, `src/lib/useHistory.ts`, `src/lib/useKeyboardShortcuts.ts`, `src/lib/utils.ts`, `src/lib/windowState.ts`, `src/main.tsx`, `vite.config.ts`, `tsconfig.json`, `.env`, `.env.example`, `refactor.js`.

Also required: RAGBOT3000's `public/audio/pcm-processor.worklet.js`, `App.tsx`, `components/VisionPreview.tsx`, `lib/deviceDetection.ts` — the remaining port-reference files.

**Steps:**

1. Read every file in the "not read" list above. For each, record: exports, public API, imports, obvious code smells.
2. Run `npx tsc --noEmit` at the project root. Capture full output. Every error is a Phase 1 work item.
3. Read `vite.config.ts` and document how env vars reach the client (Vite `define`? `import.meta.env.VITE_*`? Nothing?). This determines Phase 3's API-key-loading fix.
4. Read `tsconfig.json` and verify `"strict": true`. If not, flag for Phase 1.
5. Read `.env` and `.env.example` (without printing their contents to the conversation).
6. Read `refactor.js` at the project root. If stale scaffolding, mark for deletion. If a migration script, understand it before any storage work.
7. Read RAGBOT3000's port-reference files listed above.
8. Write `Documents/08_CURRENT_STATE_VERIFIED.md` as the single source of truth for what actually exists in the repo, with file:line citations.

**Verification gate:** Douglas reads `Documents/08_CURRENT_STATE_VERIFIED.md` and confirms it matches his mental model.

---

## Phase 1 — Compile-Clean Baseline

**Objective:** `tsc --noEmit` returns exit code 0. `npm run build` succeeds. `npm run dev` starts without runtime error. The project is in a known-good state before any behavior changes.

**Evidence:** `src/App.tsx:257-258` references undefined `setShowIntegrations` / `setShowPlugins`. This is the same rot that likely caused the sidebar "to not do shit" when Douglas last tried it.

**Steps:**

1. Fix `src/App.tsx:257-258`. Since Phase 7 will restore Live Mode as a proper chooser and Phase 8 will restore Integrations, stub these as `undefined` or make the Sidebar props optional for now. Minimal change. No new features in this phase.
2. Fix every other `tsc --noEmit` error found in Phase 0 step 2.
3. Enable strict mode in `tsconfig.json` if not already on: `"strict": true`, `"noUncheckedIndexedAccess": true`, `"exactOptionalPropertyTypes": true`. Fix fallout.
4. Add `"type-check": "tsc --noEmit"` as a distinct npm script.
5. Install and configure `eslint` with `@typescript-eslint`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`. Run `eslint --fix src/`.
6. Delete `refactor.js` if Phase 0 confirmed it is stale.
7. Delete `src/lib/plugin-manager.ts` — out of scope per v2 decisions.

**Verification gate:** Douglas runs `npm run type-check`, `npm run lint`, `npm run build`, `npm run dev` and each exits cleanly. Splash screen renders.

---

## Phase 2 — MCP Backend Bridge (WebSocket → stdio → Desktop Commander)

**Objective:** The frontend talks to Desktop Commander through a WebSocket-to-stdio bridge that ships with this repo. Real file reads and writes land on disk at a sane user-scoped path. Silent-fail becomes loud-fail.

**Evidence:**
- `src/lib/mcp.ts:11` — frontend opens WebSocket to `ws://localhost:3001/mcp` **(forbidden port — must change to 13001, the canonical claim in `port-registry.json`)**
- `src/lib/mcp.ts:21, 38` — frontend calls non-standard `mcp/configure_servers`
- `src/lib/mcp.ts:47` — `connect()` silently swallows WebSocket errors
- `find` for server files returned zero matches — **no backend exists in this repo**
- `src/lib/storage.ts:48-93` — every `readFile` silent-fails
- `src/lib/storage.ts:48, 64, 72, 88` — hardcoded `/data/*.json` paths resolve to filesystem root under real DC

**Steps:**

1. Create `server/mcp-bridge.ts` at the repo root (not a sub-package).
2. Install deps: `npm install ws && npm install -D @types/ws tsx concurrently`.
3. Write `server/mcp-bridge.ts`:
   - Opens a WebSocket server on **port 13001** via `ws` (claimed in `/Volumes/SanDisk1Tb/SSOT/port-registry.json` for `gemini-for-macos`)
   - On first client connection, spawns Desktop Commander via `child_process.spawn` (exact binary/invocation determined in Phase 0)
   - Restricts DC scope to `path.join(os.homedir(), 'Library/Application Support/gemini-macos')`
   - Pipes WebSocket frames → `dcProcess.stdin.write(JSON.stringify(msg) + '\n')`
   - Line-buffers `dcProcess.stdout`, parses each line as JSON-RPC, forwards to connected WebSocket clients
   - Surfaces `dcProcess.stderr` with a `[DC]` prefix
   - On DC crash, emits `{ error: 'mcp_server_crashed' }` and attempts one automatic restart with exponential backoff
4. **Remove** the `mcp/configure_servers` call path:
   - Delete `MCPClient.updateServers` in `src/lib/mcp.ts:17-26`
   - Delete the call in `connect` at L37-39
   - Delete the call sites in `App.tsx:85, 113`
   - Hide the MCP server editor section in `Settings.tsx:154-277` (leave the `mcpServers` field on `AppSettings` as dormant forward-compat)
5. **Fix the path prefix.** Introduce `DATA_DIR` constant in `src/lib/storage.ts`, replace every `/data/*.json` literal with `` `${DATA_DIR}/${name}.json` ``. Ensure the directory exists on first write via `ensureDataDirectory()` as the first line of `storage.init`.
6. **Flip silent-fails to loud-fails:**
   - `storage.init` still tolerates "file does not exist yet" (empty state is valid on first run) but surfaces a Toast on any other failure
   - `storage.save*` functions re-throw on write failure; `App.tsx` catches and shows a Toast
   - `src/lib/mcp.ts:connect()` rejects the promise on failure instead of resolving-with-no-connection
7. Add npm scripts:
   - `"server:dev": "tsx server/mcp-bridge.ts"`
   - `"dev:all": "concurrently -k -n vite,bridge \"npm run dev\" \"npm run server:dev\""`
8. Add a **startup health check** in `App.tsx`: before `storage.init()`, send a `ping` WebSocket message; if no `pong` within 10 seconds (longer than the original 3s to absorb DC cold start), render an error state: "MCP bridge not reachable at ws://localhost:13001. Run `npm run server:dev`." Don't render the workspace until it's reachable.
9. Wire a Toast surface (if `src/components/Toast.tsx` from Phase 0 is usable, use it; if not, add `sonner`).

**Verification gate:** Douglas runs `npm run dev:all`, opens the app, types a message, reloads the page, and sees the thread persist. He kills the bridge mid-session and sees a loud error within a few seconds. He restarts the bridge and the app recovers.

---

## Phase 3 — Safety Defaults & Cost Awareness

**Objective:** Safe defaults that match Douglas's workflow (not a general audience). Every error is loud. Token usage is visible. Secrets never touch the bundle.

**Evidence:**
- `src/lib/storage.ts:25` — shipped default is `autonomyMode: 'yolo'`
- `src/lib/api-config.ts:20-21` — `process.env.GEMINI_API_KEY` fallback is broken in the browser
- `src/lib/mcp.ts:145` — `writeFile` requests `WRITE` permission on every call
- `src/App.tsx:172, 217` — one chat turn = ≥2 writes = ≥2 permission prompts in non-yolo modes
- Douglas has confirmed cost awareness as a first-class concern

**Steps:**

1. **Autonomy default.** Keep `yolo` as the default since Douglas is the only user and this is a personal tool — but add a visible indicator in the sidebar showing which mode is active, so surprising writes never happen in a stricter mode without Douglas knowing.
2. **Remove the broken env fallback.** `src/lib/api-config.ts:20-21` drops `|| process.env.GEMINI_API_KEY`. Only source is `settings.geminiApiKey`. If the key is missing, throw a typed error that the app turns into a Toast + a direct link to Settings.
3. **Zod schemas at boundaries.** Create `src/lib/schemas.ts` with schemas for `AppSettings`, `Thread`, `Message`, `Gem`, `ScheduledAction`, `Artifact`, `PersonalIntelligence`. Replace hand-rolled parsers in `src/lib/json-validation.ts` with Zod `safeParse`. On parse failure: Toast, write corrupt file to `.json.corrupt.<timestamp>`, load defaults.
4. **Permission coalescing.** Add `mcpClient.withScopedPermissions(scope, fn)` that prompts once for a named scope and auto-approves writes within it for the duration of `fn`. Use it in `handleSendMessage` so one chat turn = one prompt maximum in non-yolo mode.
5. **Token visibility.** Create `src/lib/token-ledger.ts`:
   - Track input + output tokens per call, per model, per thread, per day
   - Persist to `~/Library/Application Support/gemini-macos/data/token-ledger.json`
   - Expose a small badge in the sidebar footer showing today's running total
   - Expose a detail view in Settings: per-thread breakdown, per-model breakdown, 7-day history
6. **Prompt caching.** Where the SDK supports it (`@google/genai` cache API), cache system instructions and large prompt contexts so repeated generations with the same prefix don't re-bill. Pass cache metadata through the token ledger.
7. **Remove `console.log` in `src/`.** Replace with a tiny logger at `src/lib/logger.ts` gated on `import.meta.env.DEV`.
8. **Audit secret-handling.** Add a Zod schema refinement that forbids logging `settings.geminiApiKey`. Add a unit test asserting the key never appears in serialized telemetry.
9. **Error boundary** at the root of `App.tsx`. Recovery UI on crash.

**Verification gate:** Douglas sends a few messages and sees the token counter tick up in the sidebar. He deletes his API key in Settings and gets a loud error instead of silent chat failure. He triggers a deliberate bug and sees the error boundary, not a white screen.

---

## Phase 4 — Dynamic Model Configuration ("Redo with Pro")

**Objective:** Every model ID is settings-driven. Users can switch models per-capability. Thinking budget is exposed as a cost/quality lever. The "Redo with Pro" escalation pattern works.

**Evidence:**
- 7 hardcoded model literals across `App.tsx:183`, `Canvas.tsx:90`, `multimodal.ts:8, 32, 77, 132`
- `types.ts:57-66` — no `models` field
- `Settings.tsx` — no model selector
- Compass `geminiService.ts:31, 69` — thinking budget as a real per-call lever (2048 fast / 32768 deep)
- `Documents/06_SDK_GROUNDING_REPORT` — current live model IDs confirmed

**Steps:**

1. Extend `src/types.ts`:
   ```ts
   export type ModelSettings = {
     text: string;           // default: 'gemini-3.1-pro-preview'
     textFallback: string;   // default: 'gemini-3.1-flash-lite-preview'
     imagePro: string;       // default: 'gemini-3-pro-image-preview'
     imageFlash: string;     // default: 'gemini-3.1-flash-image-preview'
     video: string;          // default: 'veo-3.1-lite-generate-preview'
     music: string;          // default: 'lyria-3-clip-preview'
     tts: string;            // default: 'gemini-2.5-flash-preview-tts'
     liveAudio: string;      // default: 'gemini-3.1-flash-live-preview'
   };
   export type AppSettings = {
     /* existing */
     models: ModelSettings;
     schemaVersion: number;
   };
   ```
2. Extend `defaultSettings` in `storage.ts` and the Zod schema in `schemas.ts`.
3. Add a migration: if a loaded `AppSettings` has no `models` field, substitute defaults and bump `schemaVersion`.
4. Replace hardcoded literals with settings reads:
   - `App.tsx:183` → `settings.models.text`
   - `Canvas.tsx:90` → `settings.models.text` (thread `settings` as a prop or via a hook)
   - `multimodal.ts:8` → `usePro ? settings.models.imagePro : settings.models.imageFlash`
   - `multimodal.ts:32` → `settings.models.video`
   - `multimodal.ts:77` → `settings.models.music`
   - `multimodal.ts:132` → `settings.models.tts`
   - Refactor `multimodal.ts` functions to accept a `models: ModelSettings` parameter.
5. Create `src/lib/model-catalog.ts` — curated list of known-live IDs per category plus a `custom` option with free-text input.
6. Add a **Models** section in `Settings.tsx` with eight dropdowns (one per `ModelSettings` field), sourced from `model-catalog.ts`.
7. **Thinking budget controls.** Add a per-capability thinking budget in a new settings field (`thinkingBudgets: { text, vision }`). Default to modest values, expose in Settings. Apply via `config.thinkingConfig: { thinkingBudget: n }` in `App.tsx` and `Canvas.tsx` generation calls.
8. **"Redo with Pro" button** in the chat surface: when a message is generated against `models.textFallback`, show a secondary button to re-issue the same prompt against `models.text`. Show the cost differential as a tooltip.

**Verification gate:** Douglas changes the dropdown from Pro to Flash Lite, sends a message, confirms the cheaper model answered, clicks "Redo with Pro," confirms the better model answered. Token ledger reflects both calls with correct model attribution.

---

## Phase 5 — Chat + Multimodal Verification (Make "It Works" True)

**Objective:** Every chat and Canvas action succeeds end-to-end. The defensive ternaries and dead code paths are gone. Douglas can personally verify every Magic Wand action.

**Evidence:**
- `src/App.tsx:191` — `response.text` ternary
- Compass `geminiService.ts:49, 82` and `useMemoryTidier.ts:71` — **confirm `response.text` is a property, not a method**
- `src/lib/multimodal.ts:45` — `getVideosOperation` signature unverified
- `src/lib/multimodal.ts:96-117` — dead synth_id block with short-circuit L115

**Steps:**

1. **Fix `response.text` extraction.** `App.tsx:191` becomes `const responseText = response.text ?? '';`. Remove the ternary. Add a unit test asserting the shape against installed `@google/genai` types.
2. **Verify and fix `getVideosOperation`.** Read `node_modules/@google/genai/dist/types.d.ts` for the method signature at installed version. If it takes `{ operation: Operation }`, pass an Operation; if `{ name: string }`, pass the operation name. Fix `multimodal.ts:45`. Unit test.
3. **Delete the dead synth_id block** at `multimodal.ts:96-117`. Document the assumption ("Lyria 3 outputs are inherently watermarked; frontend cannot verify") as a code comment.
4. **Error surfaces for every `multimodal.*` function.** Replace `console.error + return null` with typed throws that Canvas surfaces via Toast.
5. **Personal smoke-test run (Douglas does this, not CI).** Open a fresh app, enter API key, send a chat message, open the Canvas Magic Wand menu, run each of: Rewrite, Summarize, Generate Code, Read Aloud, Turn into Song, Generate Trailer. Confirm each produces visible output. Any failure → root-cause and fix before proceeding.
6. **Verify the supporting surfaces** (per Phase 0's reads of Chat, Sidebar, Gems, PI, ArtifactLibrary, Search, CommandPalette, ShortcutEditor): each one opens, each one works, each one persists through the bridge.

**Verification gate:** Douglas personally runs the six Canvas actions and confirms each works. Douglas opens every sidebar item and confirms each works. This is the gate that finally makes "chat works" a true statement instead of an assumption.

---

## Phase 6 — Scheduled Actions via launchd

**Objective:** Scheduled prompts fire on their schedule via macOS `launchd`, not via an in-app JavaScript timer. Survives app closure, survives reboots, survives the frontend being unopened.

**Evidence:**
- `src/components/ScheduledActions.tsx` — UI persists schedules
- `grep setInterval src/` — only autosave uses it; no scheduler anywhere
- Douglas has confirmed launchd as the intended primitive

**Architecture:**

The bridge process from Phase 2 is the ideal host for the launchd integration because it already has Node and file-system access. The frontend creates/edits/deletes schedules via the bridge; the bridge writes `.plist` files to `~/Library/LaunchAgents/` and calls `launchctl load` / `launchctl unload`. Each plist invokes a small CLI command that POSTs to the bridge's new HTTP endpoint, which runs the scheduled prompt against the Gemini API and writes the result back to a designated "Scheduled" thread.

**Steps:**

1. **Extend `server/mcp-bridge.ts`** with an HTTP server alongside the WebSocket server. Endpoints:
   - `POST /schedule/run` — body `{ actionId: string }` — runs the prompt for the given scheduled action
   - `POST /schedule/register` — body `{ actionId, cron, prompt }` — writes the plist and loads it
   - `POST /schedule/unregister` — body `{ actionId }` — unloads and deletes the plist
2. **Plist template.** The bridge writes a plist per scheduled action with:
   - `Label` = `com.legacy.gemini-macos.schedule.<actionId>`
   - `ProgramArguments` = `["/usr/bin/curl", "-X", "POST", "http://localhost:13001/schedule/run", "-d", "{\"actionId\":\"<id>\"}", "-H", "Content-Type: application/json"]`
   - `StartCalendarInterval` or `StartInterval` computed from the cron expression
   - `StandardOutPath` / `StandardErrorPath` for logging
3. **Cron → StartCalendarInterval translation.** launchd uses a different schedule format than cron. Add a small translator in `server/cron-to-launchd.ts`. For patterns that don't map cleanly (every-N-minutes), use `StartInterval` in seconds.
4. **Frontend: `src/lib/scheduler-client.ts`** — thin wrapper around the bridge's HTTP endpoints. `registerSchedule`, `unregisterSchedule`, `runNow`.
5. **Update `ScheduledActions.tsx`:**
   - Save button calls `schedulerClient.registerSchedule` (not just storage)
   - Delete button calls `schedulerClient.unregisterSchedule`
   - Enable/disable toggles call un/register
   - "Run now" button for manual testing
   - Last-run / next-run display columns
   - Validation: reject invalid cron on save
6. **Dedicated "Scheduled" thread.** When a scheduled action fires, its prompt and the model's response are appended to a distinguished thread in the sidebar (clock icon). Each message is tagged with the triggering `actionId`.
7. **Permission model.** Scheduled runs inherit Douglas's autonomy mode. In `yolo` (default), writes auto-approve. In stricter modes, the scheduled-run path uses `withScopedPermissions` from Phase 3 so there's one prompt per run, not one per write.

**Verification gate:** Douglas schedules an action with `* * * * *`, closes the app entirely, waits two minutes, reopens, and sees two entries in the Scheduled thread. He verifies the plist exists in `~/Library/LaunchAgents/`. He deletes the action and confirms the plist is gone.

---

## Phase 7 — Live Mode: Three-Button Surface

**Objective:** Three user-invoked Live Mode buttons — Voice (STS) / Camera / Screen. Ported verbatim from RAGBOT3000's production `LiveSession` class. Not always-on. Dormant until invoked.

**Architecture:**

One `LiveSession` class. Three different ways to start it. The difference between the three buttons is *which `MediaStream` (if any) gets passed to `session.startVideoStream(stream)` after connection*. Everything else — audio pump, gapless playback, barge-in, reconnection, clean disconnect — is shared.

**Port list (copy verbatim, then adapt):**

| Source file in RAGBOT3000 | Destination in Gemini for macOS | Adaptation |
|---|---|---|
| `services/liveService.ts` (`LiveSession` class) | `src/lib/live-session.ts` | key source, model ID, system instruction source, memory hook |
| `hooks/useMediaStream.ts` | `src/hooks/useMediaStream.ts` | none except imports |
| `public/audio/pcm-processor.worklet.js` | `public/audio/pcm-processor.worklet.js` | verbatim |
| `components/VisionPreview.tsx` | `src/components/VisionPreview.tsx` | styling to match Gemini for macOS |
| `lib/deviceDetection.ts` | `src/lib/device-detection.ts` | verbatim |

**Four adaptations (and only these four):**

1. **API key.** Replace `genAI = new GoogleGenAI({ apiKey: process.env.API_KEY })` at module scope with a lazy `getLiveAI()` function that reads `settings.geminiApiKey` at invocation time. Cache the instance keyed on the current key.
2. **Model ID.** Replace hardcoded `'gemini-2.5-flash-native-audio-preview-09-2025'` at `liveService.ts:206` with `settings.models.liveAudio`, defaulting to `'gemini-3.1-flash-live-preview'`.
3. **System instruction.** Replace the hardcoded Legacy persona fallback at `liveService.ts:195-202` with a composition of the active Gem's `systemInstruction` + `PersonalIntelligence.instructions` + session-specific context (which button was pressed and what it's supposed to do).
4. **Memory hook.** Replace `memoryManager.upsertSession` at `liveService.ts:547-558` with a writer that appends the live session transcript to the currently-active chat thread as a special message type (`type: 'live-session'`) when the session ends.

**Three buttons (UX spec):**

### Button 1 — Voice (STS)

- **Invocation:** "Live Mode" sidebar entry → chooser modal → "Voice" option
- **Session panel:** compact (~400×500 px) centered modal
- **Layout:**
  - Title bar: "Live Mode — Voice" + close button
  - Audio visualizer (RAGBOT3000's `AnalyserNode` at `fftSize: 512`, rendered via canvas)
  - Current state indicator ("Listening…" / "Speaking…" / "Connecting…" / "Reconnecting…")
  - Mic mute button
  - Transcription captions: **default OFF**, toggle switch to turn on
  - End session button
- **Stream:** `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })` only
- **No `startVideoStream` call**

### Button 2 — Camera

- **Invocation:** "Live Mode" sidebar → chooser → "Camera"
- **Session panel:** larger (~720×640 px) to accommodate video preview
- **Layout:**
  - Title bar: "Live Mode — Camera" + close button
  - Video preview region (`<video srcObject={stream} autoPlay playsInline muted>`) showing what the model sees
  - Audio visualizer beneath video
  - Current state indicator
  - Mic mute button
  - Camera facing toggle (front/back) — calls `useMediaStream.toggleCamera()`
  - Transcription captions: **default ON**, toggle to turn off
  - End session button
- **Stream:** audio from `getUserMedia({ audio: true })` + video from `getUserMedia({ video: { facingMode } })`
- **`session.startVideoStream(videoStream)` called after connect**

### Button 3 — Screen

- **Invocation:** "Live Mode" sidebar → chooser → "Screen"
- **Session panel:** same size as Camera (~720×640)
- **Layout:**
  - Title bar: "Live Mode — Screen" + close button
  - Video preview region showing the shared browser tab/window/screen
  - Audio visualizer beneath video
  - Current state indicator
  - Mic mute button
  - **No camera toggle** (source is whatever Douglas picked in the browser's native picker)
  - Transcription captions: **default ON**, toggle to turn off
  - End session button
- **Stream:** audio from `getUserMedia({ audio: true })` + screen from `getDisplayMedia({ video: { displaySurface: 'browser', cursor: 'always' } })`
- **`session.startVideoStream(screenStream)` called after connect**

**Shared behavior across all three:**

- Full RAGBOT3000 state machine (`idle → connecting → connected → reconnecting → disconnecting`)
- Typed error surface (`permission_denied | network_error | api_error | audio_context_error`) → Toast
- Barge-in via `isSpeakingOrRecently(1200)` + `suppressOutputUntilMs`
- AudioWorklet primary, `ScriptProcessorNode` fallback
- Gapless audio playback via `nextStartTime` tracking
- Exponential-backoff reconnect (1s × 2ⁿ, 30s cap, 5 attempts)
- `AbortController`-based cancellation
- Clean disconnect tears down worklet / processor / sources / audio contexts / session in order
- Session transcript written to the active thread as a `type: 'live-session'` message on disconnect

**Delete in this phase:**

- `src/components/LiveMode.tsx` (current WebRTC mirror facade) → replaced by the new three-button chooser + session panels
- `src/lib/multimodal.ts:152-172` (`startCameraStream`, `startScreenShare` dead wrappers)

**Verification gate:** Douglas personally tests each button:
- Voice: opens, has a back-and-forth conversation, barge-in works, disconnect cleans up mic
- Camera: opens, points at a pill bottle and a peanut butter jar, model distinguishes them verbally, camera toggles between front/back
- Screen: opens, shares a browser tab with a design Douglas likes, asks the model about the color palette and typography, model reads the screen and responds

---

## Phase 8 — Google Integrations (Direct-to-Google, No Proxy)

**Objective:** Restore orphaned Google integrations with a simplified architecture — direct bearer-token fetches, not the HttpOnly-cookie backend proxy the current code assumes. Douglas's Google project is already set up and OAuth is already consented.

**Evidence:**
- `src/lib/integrations.ts:1-88` — implementations exist for NotebookLM, Docs, Drive, Travel
- `src/lib/oauth-handler.ts:1-95` — assumes `/api/auth/google/*` backend proxy
- Git log confirms `Integrations.tsx` and `Plugins.tsx` were deleted
- Douglas has confirmed: Google project set up, OAuth consented, no second backend needed

**Architecture pivot:**

The current code assumes a web-scale HttpOnly-cookie pattern. For a local-only personal tool, use OAuth 2.0 with PKCE + refresh token stored by the bridge in the user-scoped data directory. No `/api/*` HTTP proxy layer.

**Steps:**

1. **Extend `server/mcp-bridge.ts`** with an OAuth callback endpoint:
   - `GET /oauth/callback?code=...&state=...` — handles the redirect back from Google
   - Stores `{ refresh_token, access_token, expires_at, scopes }` in `~/Library/Application Support/gemini-macos/data/google-auth.json`
   - Returns a minimal HTML page that tells Douglas he can close the tab
2. **Rewrite `src/lib/oauth-handler.ts`** as a client of the bridge:
   - `requestGoogleOAuthToken(scopes)` — opens a browser tab to Google's authorize URL with PKCE parameters and `redirect_uri=http://localhost:13001/oauth/callback`. Polls the bridge for completion. Returns `true` on success. **Note:** `http://localhost:13001/oauth/callback` must be registered as an authorized redirect URI in the Google Cloud Console for the existing OAuth project before this works.
   - `getAccessToken(scopes)` — asks the bridge for a current access token, refreshes if needed
   - `revokeGoogleAuth()` — calls Google's revoke endpoint and deletes the local auth file
   - `checkGoogleAuthStatus()` — queries the bridge
3. **Rewrite `src/lib/integrations.ts`** to call Google APIs directly:
   ```ts
   async importDoc(docId: string) {
     const token = await getAccessToken(['https://www.googleapis.com/auth/documents.readonly']);
     const response = await fetch(`https://docs.googleapis.com/v1/documents/${docId}`, {
       headers: { Authorization: `Bearer ${token}` }
     });
     if (!response.ok) throw new Error(`Google Docs API error: ${response.status}`);
     return await response.json();
   }
   ```
   Same pattern for Drive, NotebookLM, Travel.
4. **Create `src/components/Integrations.tsx`:**
   - Modal with sections per service (NotebookLM, Drive, Docs, Calendar, Travel)
   - Each section: "Connect" button, connection status indicator, action buttons ("Import a document…", "Import from Drive…")
   - Drive imports use Google's Picker API for file selection
   - Imported content becomes a new Artifact in the Artifact Library
5. **Re-wire in `App.tsx`:**
   - Add `showIntegrations` state
   - Add `onOpenIntegrations={() => setShowIntegrations(true)}` to Sidebar props
   - Render `<Integrations>` modal
   - This resolves the Phase 1 deferral

**Verification gate:** Douglas clicks Connect Google Drive, completes OAuth in the popup, sees the "Connected" indicator, imports a Doc into his Artifact Library, reloads the app and sees the connection persist.

---

## Phase 9 — MCP Command Execution Wiring

**Objective:** `mcpClient.execute()` has real callers. Code artifacts in Canvas can be run through Desktop Commander with output streamed back.

**Evidence:**
- `src/lib/mcp.ts:162-178` — `execute` method exists
- Grep confirmed zero callers of `.execute()` anywhere in `src/`

**Steps:**

1. **Extend bridge and client for streaming execution.**
   - Bridge forwards DC's streaming tool call results chunked through the WebSocket
   - `MCPClient.execute` returns `AsyncIterable<{stream: 'stdout'|'stderr', data: string}>` instead of `Promise<boolean>`
2. **Add "Run" affordance to Canvas.** For artifacts with `type: 'code'`, show a Run button next to Save. Dropdown to pick interpreter (`bash`, `python3`, `node`, `tsx`). On click:
   - Write artifact content to a temp file in `~/Library/Application Support/gemini-macos/exec-sandbox/<uuid>.<ext>` via `mcpClient.writeFile`
   - Call `mcpClient.execute(interpreter + ' ' + filepath)`
   - Render output in a terminal-style panel beneath the editor
   - Stop button that kills the child process
3. **Hardened permission modal for execute.** Shows the full command string, styled more prominently than file-write prompts, requires an explicit click (no Enter-key auto-confirm).
4. **Execution sandbox.** Restrict execute commands to the `exec-sandbox` directory. Clean up temp files after runs.
5. **Execution audit log.** `~/Library/Application Support/gemini-macos/data/exec-audit.log` — timestamp, command, exit code, output snippet. Settings pane shows history.
6. **Disabled by default.** `settings.enableCodeExecution: boolean` default `false`. Run button hidden until enabled. Enabling requires an explicit confirmation dialog with a warning.

**Verification gate:** Douglas creates a code artifact containing a short Python script, enables code execution in Settings, clicks Run, sees output stream into the panel, runs a deliberately long-running script and cancels it mid-run.

---

## Phase 10 — Targeted Testing (Not Coverage-Driven)

**Objective:** Tests exist only where they save Douglas time. Not 80% coverage. Not test-every-library. Tests for the things that have burned him or would burn him.

**Evidence:**
- `@playwright/test ^1.59.1` in devDependencies, unused
- `vitest ^4.1.4` in devDependencies, unused
- Douglas is the only tester; tests are leverage, not process

**Targeted test list:**

1. **Live Mode reconnection** (Playwright with mocked network) — the most complex code path, most likely to regress, hardest to manually re-verify
2. **Google OAuth flow** (Playwright with mocked Google endpoints) — multi-step, browser-popup-based, painful to test manually
3. **launchd scheduler plist generation** (Vitest) — cron → launchd translation correctness, plist format validity
4. **MCP bridge handshake** (Vitest + a fake DC child process) — connect / ping / pong / reconnect logic
5. **Zod schema round-trip** (Vitest) — load/save/reload doesn't lose data or silently migrate
6. **Token ledger math** (Vitest) — cumulative totals are correct across calls and model switches
7. **`response.text` extraction** (Vitest against the installed SDK types) — makes sure the ternary-to-property change doesn't break

That's it. Everything else gets tested manually by Douglas using the app. If something bites him twice, it earns a test. Not before.

**Verification gate:** Douglas runs `npm run test` and sees the seven listed tests pass.

---

## Phase 11 — Packaging: DEFERRED (NOT ON ROADMAP)

**This section exists to document why packaging is not happening, not to schedule it.**

Packaging is explicitly **not** part of this roadmap. No Tauri. No `.dmg`. No code signing. No notarization. Not scheduled. Not implied. Not a reward the agent can chase.

**Why it's deferred:** The classic LLM failure mode is "the checklist says package, so package, regardless of whether the thing works." That loop burns tokens and trust. It leads to rebuilds and repackagings while the actual functionality remains broken. The correct discipline is:

1. Build the app with production-grade quality
2. Run it via `npm run dev:all` for as long as it takes
3. Let Douglas personally use it
4. When Douglas has lived with the working app long enough to know it's worth wrapping, he asks for packaging
5. Only then — and not before — do we have a Phase 11 conversation

The code should not contain any "we'll fix this when we wrap it in Tauri" hacks. The code should not have environment-guarded packaging shims. The code should be ready to be packaged without any packaging work actually happening, so that if and when Douglas asks, the work is a wrapper around a finished app, not a finishing of an unfinished app.

**What the agent is forbidden from doing:**
- Suggesting packaging as a next step after any phase completes
- Running `tauri init` or equivalent without explicit instruction
- Modifying the build or dev workflow in ways that anticipate packaging
- Referring to a `.dmg`, `.app`, Tauri, Electron, or signing in any context other than "Douglas said so"

When Douglas says "now let's package it," that's a new conversation with a new plan. Not this one.

---

## Global Verification Gate

The plan is complete when **all of the following are true**:

- [ ] Phases 0-10 have each been marked complete via Douglas's explicit confirmation, not CI
- [ ] Douglas can open the app on a fresh restart via `npm run dev:all` and chat works end-to-end
- [ ] Douglas can reload the page and his threads/gems/artifacts/settings persist
- [ ] Douglas can use Live Mode in all three modes (Voice / Camera / Screen) and the sessions work the way RAGBOT3000's do
- [ ] Douglas can schedule a launchd-backed action and it fires on its schedule even with the app closed
- [ ] Douglas can connect Google Drive, import a Doc, and see it appear in the Artifact Library
- [ ] Douglas can enable code execution, run a script in Canvas, and see the output stream
- [ ] Douglas has visibility into his daily token spend in the sidebar
- [ ] No hardcoded model IDs outside `model-catalog.ts` and `defaultSettings`
- [ ] No `process.env.*` references in `src/`
- [ ] No silent-fail catches except where explicitly documented
- [ ] The seven targeted tests from Phase 10 pass
- [ ] Douglas wants to keep using the app tomorrow

**The final criterion is the only one that matters.** If Douglas doesn't want to keep using the app after Phase 10, the other twelve are false positives.

---

## Execution Discipline

After every phase I will:

1. Report what was built, what was changed, what was deleted
2. List the specific things for Douglas to manually test
3. **Wait for Douglas's confirmation** before moving to the next phase
4. Not mark a phase complete on my own judgment
5. Not chase packaging as a reward signal
6. Not "improve" working reference code beyond the four documented adaptations in Phase 7
7. Surface blockers loudly when they appear, with the specific file:line evidence

Post-Phase-5, the order of Phases 6-9 is flexible. Douglas picks which capability he wants to use first. No architectural dependency forces a particular order after chat is working.

---

## Plan Metadata

| Field | Value |
|---|---|
| Timezone | `America/Indiana/Indianapolis` (EDT, UTC−4) |
| Generated at (local) | 2026-04-13 20:02 EDT |
| Generated at (UTC) | 2026-04-14 00:02 UTC |
| Plan path | `Documents/07_IMPLEMENTATION_PLAN_V2_2026-04-13.md` |
| Predecessor | `Documents/06_SDK_GROUNDING_REPORT_2026-04-13.md` |
| Successor (on Phase 0 completion) | `Documents/08_CURRENT_STATE_VERIFIED.md` (to be written) |
| Supersedes | v1 conversational plan (never persisted) |

---

*End of plan v2. Ready for Phase 0 on Douglas's word.*
