# Plan: Chat barge-in and queue (Claude-Code-style)

**Status:** Draft
**Author:** Plan agent, 2026-06-08
**Target repo:** `/Volumes/SanDisk1Tb/GEMINI for MacOS`
**Scope:** Frontend (`src/components/Chat.tsx`, `src/App.tsx`) + generation abort surface (`src/lib/generation-wrapper.ts`)
**Out of scope:** Backend MCP changes, prompt doctrine, COHORT, credentials

## 0. Goal

Make the Chat input behave the way Claude Code's REPL behaves:

1. While the agent is thinking, the user can **stop** the current turn with a single click. The stop halts generation immediately and discards the partial stream — the in-flight model message is removed or marked as cancelled. The input regains focus and is empty.
2. While the agent is thinking, the user can **type a new message and press Enter**. The new message is **queued** in a visible "pending" strip above the input. The agent continues its current turn uninterrupted.
3. While a message is queued, the user can **press the send button again** to **barge**: the queued message is sent immediately, injected as a user-role turn in the same thread, and the agent's current generation is **aborted** so the new message is processed next. The agent is told, via a system-injected note, that the user added information mid-flight.
4. Queued messages can be **edited in place** and **cancelled** (×) before they fire.

Barge is the union of (1) stop and (2) queue-and-flush. It is distinct from "queue and wait for natural turn boundary" — Claude Code flushes immediately on second send. We mirror that.

This plan does not invent any new infra beyond an `AbortController` and a small `queuedMessages` slice in App state. The backend stream is already a single async function; we just need to let the UI tear it down.

## 1. Current state (evidence-backed)

All line numbers are against the current tree at the time of writing (commit on this branch, HMR-live).

### 1.1 Chat input is single-flight and disabled-while-loading

`src/components/Chat.tsx:313-343` — the form. Relevant facts:

- `disabled={isLoading}` on the text input (line 336) — user cannot type during a turn.
- `disabled={(!input.trim() && !attachment && !contextBundle) || isLoading}` on the send button (line 340) — user cannot send during a turn.
- Placeholder toggles to `"Gemini is thinking..."` while `isLoading` (line 335) — no visible affordance for interruption.
- `handleSubmit` at line 110-121 calls `onSendMessage(content, undefined, attachment ?? undefined)` and clears the input. There is no "queue" path; the only way a message is held is the local `input` state, and that state is wiped on send.

### 1.2 Send handler is one long async block

`src/App.tsx:480-879` — `handleSendMessage`. Relevant facts:

- `setIsLoading(true)` at line 491. Cleared in the `finally` at line 877.
- The streaming loop is `for (let iter = 0; iter < 10; iter++)` (line 651). Each iteration calls `generateWithFailoverStream` (line 662) and breaks only on text completion, budget breach, or `functionCalls.length > 0` resolved.
- `onChunk` callback at line 668-671 updates the streaming message via `upsertStreamingModelMessage`. There is no abort lever wired today.
- The loop runs tool calls (line 741-751) by awaiting `mcpClient.executeTool`. An abort must also stop the in-flight `executeTool` call or it will keep making MCP requests for a turn the user has already cancelled.

### 1.3 The streaming wrapper has no abort surface

`src/lib/generation-wrapper.ts:137-221` — `generateWithFailoverStream`. Relevant facts:

- Public type is `GenerationStreamOptions extends GenerationOptions` with the only addition being `onChunk?: StreamChunkCallback` (line 124-126).
- No `AbortSignal` is accepted or checked. The summary collapses the body, so I am asserting the surface from the type only; an executor reading the actual `for` loop in lines 137-221 must confirm whether `@google/genai`'s `generateContentStream` is being called and whether the SDK already accepts a `signal` — see "Verification before any change" below.

### 1.4 Chat props surface

`src/components/Chat.tsx:8-19` declares 9 props. The plan will add three:

- `onStop: () => void` — called when the user clicks the stop button.
- `onSendQueued: (content: string) => void` — called when the user clicks "send now" on a queued message.
- `onCancelQueued: (id: string) => void` — called when the user removes a queued message.
- `queuedMessages: ReadonlyArray<{ id: string; content: string }>` — rendered as the "pending" strip.

`App.tsx:1047-1063` passes the existing 9 props. The plan will add the four new ones at the same call site.

## 2. Design

### 2.1 Abort wiring

Introduce a single `AbortController` per in-flight `handleSendMessage` invocation. Stash it on a ref so the UI can call `controller.abort()` from anywhere.

- `App.tsx` adds `const abortRef = useRef<AbortController | null>(null);`.
- At the top of `handleSendMessage`, after `setIsLoading(true)`, create `abortRef.current = new AbortController();`.
- `handleStop()` calls `abortRef.current?.abort()` then `setIsLoading(false)` and clears the streaming message in the thread (the partial text the user sees is dropped, mirroring Claude Code's stop behavior).
- In the `finally` block, set `abortRef.current = null;`.
- `generateWithFailoverStream` is extended to accept `signal?: AbortSignal` in `GenerationOptions`. Inside the retry loop and inside the `generateContentStream` call, the wrapper either throws on `signal.aborted` or passes `signal` to the SDK call. The plan calls for the former: a `try { ... } catch (err) { if (signal?.aborted) throw new DOMException('aborted', 'AbortError'); ... }` pattern. The SDK call path is verified during Step 1.

This makes abort symmetric: the controller is the only abort lever; the stream loop checks it on each chunk and on each tool execution; MCP tool calls are aborted by checking `signal.aborted` before issuing each new tool.

### 2.2 Queue wiring

Add a `queuedMessages` slice to `App` state:

```
const [queuedMessages, setQueuedMessages] = useState<Array<{ id: string; content: string }>>([]);
```

`Chat.tsx` continues to own its own `input` draft. When the user submits while `isLoading`:

- If `isLoading` is `false` (normal path), call `onSendMessage(content, ...)` — unchanged.
- If `isLoading` is `true`, push `{ id: uuidv4(), content }` into `queuedMessages` and clear the input. The strip renders the new queued message immediately above the input.

The placeholder while `isLoading` becomes `"Queue a follow-up (Enter to queue, click send to barge)"`. The send button is no longer disabled while `isLoading`; instead it shows a small chevron / arrow-up icon when there is a queued message and a normal Send icon otherwise. The button label/tooltip reads:

- No queued items, not loading: "Send message"
- Queued items present: "Send now and stop current turn"
- Not loading, empty input: "Send message" (disabled)

When the user presses Enter with content while a turn is in flight, the message goes to the queue strip. When the user clicks the send button while a turn is in flight, the message is appended to the queue AND the current turn is aborted (barge). When the user clicks "send now" on a queued message, that queued message is injected and the current turn is aborted (same as barge, just from a different UI surface).

### 2.3 Queue strip UI

A horizontal scrollable row sits between the chat scroll area and the input form, only visible when `queuedMessages.length > 0`. Each item is a pill:

```
[ edit pencil ] "Half the words, also consider X"  [×]
```

Clicking the body opens an inline editor (reuse the existing `editContent` + `editingId` pattern from Chat.tsx:131-142). Pressing Enter or "Save" calls `onEditQueued(id, newContent)`. The × button calls `onCancelQueued(id)`.

The "send now" affordance: a small play icon at the right end of the strip ("Send all queued now"). If the user wants to send only one queued message, they cancel the others first. This matches Claude Code: the strip is treated as a single "burst" the user can flush.

### 2.4 Barge message surface

When a barge fires (queue strip send-now, or input send-while-loading), the user message is appended to the thread as a normal user-role turn. To inform the model that this is a barge, we prepend a small system note inside the user message:

```
[User pressed send mid-turn. The previous model turn was cancelled. Please incorporate this message into your plan.]
<user content>
```

This is rendered in the chat as a normal user message bubble; the bracketed note is part of the persisted content. We do NOT modify the system prompt — we modify the user-role content, which keeps the change surgical and reviewable. The bracketed prefix is consistent with the existing convention in `App.tsx` of prefixing tool errors and budget warnings.

### 2.5 Cancellation message

When the user stops a turn without sending anything else, the partial streaming message is removed. We do NOT add a placeholder "stopped" message in the chat — the thread simply ends at the last user message, matching Claude Code's behavior. If the user wants to acknowledge the stop, they type a new message.

## 3. Step-by-step

### Step 1: Verify abort surface in `generateWithFailoverStream` and `@google/genai`

**Why first:** the entire plan hinges on whether the streaming SDK accepts a signal or whether we abort by checking `signal.aborted` in a wrapper loop. Wrong assumption here cascades.

- **Files:** `src/lib/generation-wrapper.ts`, `node_modules/@google/genai/dist/web/index.d.ts` (or wherever the SDK types live).
- **Action:** read the body of `generateWithFailoverStream` (the summary at lines 137-221 collapses the loop). Find the `generateContentStream` call site. Determine:
  1. Does the SDK accept a `signal` option?
  2. If not, is the loop structured such that we can check `signal.aborted` between chunks?
- **Output:** a 1-paragraph note in the PR description confirming the chosen abort path (SDK signal vs wrapper check).
- **Exit criteria:** abort path decided and noted in PR body. If neither works, BLOCKED with the exact SDK limitation.

### Step 2: Extend `GenerationOptions` to accept `signal`

- **File:** `src/lib/generation-wrapper.ts:222-235` (the `GenerationOptions` interface).
- **Change:** add `signal?: AbortSignal;` to the interface. In the streaming wrapper body, before each `await generateContentStream(...)` and between chunks, check `if (options.signal?.aborted) throw new DOMException('aborted', 'AbortError');`.
- **Why:** without this, calling `controller.abort()` does nothing — the stream keeps consuming tokens and the loop keeps iterating.
- **Verification:** add a unit test in `src/lib/__tests__/generation-wrapper.test.ts` (create if absent) that passes a pre-aborted `AbortSignal` and asserts the wrapper throws `AbortError` on the first await.

### Step 3: Plumb `AbortController` through `App.tsx`

- **File:** `src/App.tsx`.
- **Changes:**
  - Line ~52: import `useRef` from react (already imported at line 1 — confirm).
  - New ref near the other state: `const abortRef = useRef<AbortController | null>(null);`.
  - Inside `handleSendMessage` (line 480-879), at line 491 (`setIsLoading(true)`), add `abortRef.current = new AbortController();`.
  - At the call to `generateWithFailoverStream` (line 662), pass `signal: abortRef.current.signal`.
  - In the tool-execution loop (line 741-751), check `if (abortRef.current?.signal.aborted) break;` before each `mcpClient.executeTool`.
  - In the `finally` block (line 876-878), set `abortRef.current = null;` before `setIsLoading(false);`.
  - New `handleStop` function (next to `handleRegenerate` around line 882): `() => abortRef.current?.abort()`. Setting `isLoading` false and clearing the streaming message is done by the existing `finally` plus a new `catch (err) { if (err.name === 'AbortError') { clearStreamingModelMessage(); return; } ... }` arm.
- **Why:** the abort lever must be reachable from the UI without unmounting the component.
- **Verification:** type-check (`npm run type-check`).

### Step 4: Add queue state and helpers in `App.tsx`

- **File:** `src/App.tsx`.
- **Changes:**
  - New state: `const [queuedMessages, setQueuedMessages] = useState<Array<{ id: string; content: string }>>([]);`.
  - `handleEnqueue(content: string)` — pushes a new queued message and clears nothing (the input is owned by `Chat.tsx`).
  - `handleCancelQueued(id: string)` — filters out by id.
  - `handleEditQueued(id: string, newContent: string)` — replaces content by id.
  - `handleBargeNow()` — pops the first queued message, calls the same persistence + `setIsLoading(true)` path as `handleSendMessage`, but prefixes the user content with the barge system note from §2.4, and calls `abortRef.current?.abort()` first.
- **Why:** centralizing the queue keeps `Chat.tsx` presentation-only.
- **Verification:** type-check.

### Step 5: Extend `Chat` props

- **File:** `src/components/Chat.tsx:8-19`.
- **Changes:** add to the props interface:
  - `onStop: () => void;`
  - `onEnqueue: (content: string) => void;`
  - `onSendQueued: () => void;`
  - `onCancelQueued: (id: string) => void;`
  - `onEditQueued: (id: string, newContent: string) => void;`
  - `queuedMessages: ReadonlyArray<{ id: string; content: string }>;`
- **Verification:** type-check (catches the callsite at `App.tsx:1047-1063` that needs updating).

### Step 6: Update `App.tsx` to pass the new props

- **File:** `src/App.tsx:1047-1063` (the `<Chat ... />` call).
- **Changes:** bind `onStop={handleStop}`, `onEnqueue={handleEnqueue}`, `onSendQueued={handleBargeNow}`, `onCancelQueued={handleCancelQueued}`, `onEditQueued={handleEditQueued}`, `queuedMessages={queuedMessages}`.
- **Verification:** type-check.

### Step 7: Replace the disabled-while-loading form with a barge-capable form

- **File:** `src/components/Chat.tsx:313-343`.
- **Changes:**
  - Stop the input `disabled` (line 336). The user can always type.
  - The send button is disabled only when `(input is empty AND no attachment AND no contextBundle AND queuedMessages.length === 0)`. While `isLoading`, the button is enabled and labeled "Send now (interrupts current turn)".
  - Add a stop button to the right of the send button, visible only when `isLoading`. Click handler: `onStop`. Icon: `Square` from `lucide-react`.
  - The submit handler (line 110-121) routes:
    - If `!isLoading`: call `onSendMessage(content, undefined, attachment ?? undefined)` and clear.
    - If `isLoading`: call `onEnqueue(content)` and clear. The form does NOT clear attachments/contextBundle on enqueue — they remain attached for the eventual send. (Match user expectation: "I attached a folder, I want the folder to apply to my queued message too.")
- **Why:** the form is the single point of user intent. The new routing is the core behavior change.
- **Verification:** manual: start a long turn, type a message, press Enter — it goes to the queue. Click the strip "send now" — barge fires. Click the stop button — current turn cancels, input is empty and ready.

### Step 8: Add the queue strip UI

- **File:** `src/components/Chat.tsx`.
- **New component:** `QueuedMessagesStrip` (private to the file, or extracted to its own file if you prefer — keep it in the same file for surgical scope).
- **Position:** between the scroll area (lines 181-279) and the form (lines 313-343). The form's outer wrapper is the `<div className="w-full max-w-4xl mx-auto p-4 ...">` at line 292. Insert the strip inside that wrapper, before the form.
- **Visibility:** only when `queuedMessages.length > 0`.
- **Content:** a horizontal flex row of pills. Each pill shows the queued text (truncated, with full text on hover via `title`), an inline edit pencil, and a × cancel button. A trailing "Send all now" button at the right end of the strip.
- **Edit affordance:** clicking the pill body opens an inline textarea (reuse the pattern at lines 213-228 for `editingId`); Enter saves via `onEditQueued`, Escape cancels the edit.
- **Verification:** manual: enqueue two messages, edit one, cancel one, send the remaining.

### Step 9: Add barge system note

- **File:** `src/App.tsx`, in the new `handleBargeNow` (Step 4).
- **Change:** when constructing the user message, prefix:
  ```
  [User pressed send mid-turn. The previous model turn was cancelled. Please incorporate this message into your plan.]\n\n
  ```
  This is persisted into the thread and shown in the chat bubble as part of the message content. It is rendered like any other user message — no special UI treatment.
- **Why:** the model needs to know the user's intent was to interrupt, not to add a parallel request. Persisting the note in the user message means future context (e.g. re-opening the thread) preserves the barge semantics.
- **Verification:** read back a thread with a barge message; the note is visible in the bubble and present in `storage.getThreads()`.

### Step 10: Persist queued messages across reloads? — DECISION

- **Default:** NO. The queue is session-local. If the user reloads the app, queued messages are lost. This matches Claude Code's REPL behavior.
- **If you want persistence:** add a `queuedMessages` field on `Thread` in `src/types.ts`, then read/write it in `handleEnqueue`/`handleCancelQueued`/`handleEditQueued`/`handleBargeNow` using the same `storage.saveThread` pattern.
- **Verification of "no persistence" default:** reload the app while a message is queued — the queue is empty on next open. The thread itself is intact.

### Step 11: Keyboard shortcuts

- **File:** `src/lib/useKeyboardShortcuts.ts` (existing) or a new effect in `Chat.tsx`.
- **Add:**
  - `Cmd+.` (macOS) / `Ctrl+.` — stop the current turn. This matches Claude Code's binding.
  - `Escape` while the input is focused with content and `isLoading` is true — enqueue instead of send. (Default Enter still sends/queues; Escape while idle is a no-op to avoid clobbering other Escape behaviors.)
- **Why:** the button is one click away, but the keyboard binding is the muscle-memory path.
- **Verification:** start a turn, press `Cmd+.` — generation halts.

### Step 12: Visual states for the send button

- **File:** `src/components/Chat.tsx:340-342`.
- **States:**
  - Idle, empty input, no queue: disabled, normal Send icon.
  - Idle, has content: enabled, normal Send icon, label "Send message".
  - Loading, has content in input: enabled, "barge" icon (lucide `CornerDownLeft` or `ArrowUpRightFromSquare` — pick one), label "Send now and stop current turn".
  - Loading, no input content, queue non-empty: enabled, same barge icon, label `Send ${queuedMessages.length} queued`.
  - Loading, no input, no queue: enabled, stop-only is the affordance. The send button is disabled in this case (nothing to send).
- **Why:** the button's affordance must match the action. A user who sees a "Send" button while a turn is in flight must not be surprised when it interrupts.
- **Verification:** cycle through each state in the running app; the icon and label change accordingly.

### Step 13: Empty-state and error handling

- **Files:** `src/components/Chat.tsx`, `src/App.tsx`.
- **Cases:**
  - User clicks stop after the agent has already finished (`isLoading` already false). `handleStop` is a no-op; the button is hidden in this state anyway. Defense in depth: `if (!abortRef.current) return;` in `handleStop`.
  - User clicks "send all now" with an empty queue. Strip is not rendered, button is not reachable.
  - `mcpClient.executeTool` throws because the user already aborted. The existing `try/catch` at `App.tsx:746-750` builds a function response with `{ error: String(toolErr) }`. The model sees the error and the next iteration's `functionCalls.length` is 0, so the loop breaks. Add an explicit check: if `signal.aborted`, do not push the function response; just `break`.
  - Barge fires while a tool is mid-execution. The tool result is dropped (no function response), the user message is appended, the loop's next iteration sees the new user content and processes it. The cancelled tool's effect (e.g. a partial file write) is not undone — this matches Claude Code. Document this in a comment.

### Step 14: Tests

- **New test file:** `src/components/__tests__/Chat.queue.test.tsx` (or extend `settings-file-explorer.test.tsx` if more appropriate — separate file is cleaner).
- **Cases:**
  - Pressing Enter with content while `isLoading` calls `onEnqueue` (not `onSendMessage`).
  - Pressing the stop button calls `onStop`.
  - Clicking "send all now" calls `onSendQueued` once and does NOT clear the input.
  - Clicking × on a queued pill calls `onCancelQueued` with the right id.
  - Editing a queued pill and pressing Enter calls `onEditQueued` with the new content.
  - Disabled send button: empty input, no attachment, no context, no queue, not loading.
- **Existing test:** the abort behavior is best tested at the wrapper level (Step 2). The component tests cover the user-facing routing.

### Step 15: Update docs

- **File:** `README.md` (root).
- **Section:** "Chat controls" — add 5 lines explaining Stop, Queue, Barge, Cmd+., and the persistence decision (no queue persistence).
- **File:** `docs/architecture/API_CONTRACT.md` (if present).
- **Section:** "Chat abort" — note that `handleSendMessage` is now abortable via the in-component `AbortController`.

## 4. Verification

After all steps land:

- `npm run type-check` exits 0.
- `npm run test` passes, including the new Chat.queue tests.
- Manual smoke test in the dev server:
  1. Start a long turn (ask the model a question that requires tool calls). The send button is enabled and labeled "Send now and stop current turn". The input is enabled. The stop button is visible.
  2. Type "also consider X" and press Enter. The message disappears from the input and appears in the queue strip. The current turn is still running.
  3. Click the stop button. The streaming message is removed. The queue strip remains visible (the queued message is still pending).
  4. Click "send all now" on the strip. The queued message is sent. The bubble shows the bracketed barge note. The model responds.
  5. Press `Cmd+.` mid-turn. Generation halts; partial stream is removed.
  6. Reload the app with a queued message. The queue is empty on next open (no persistence).

## 5. Risk register

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `@google/genai` SDK ignores `signal` | Medium | Wrapper-level `signal.aborted` check before each chunk. The chunk callback is invoked synchronously between network reads, so the abort delay is at most one chunk. |
| Mid-execution tool call has side effects that survive the abort | High | Documented in §13. The user is informed by the existing toast/log. If a future requirement is undo-on-cancel, that is a separate, larger feature (MCP transaction layer). |
| Queue strip overflows horizontally with very long messages | Low | Truncate pill body to 60 chars with full text in `title`. The inline edit textarea shows the full content. |
| Barge note leaks into model behavior unexpectedly | Low | The note is short, neutral, and consistent with the existing convention of prefixing user messages (e.g. `TOOL_RESULT` in `App.tsx:774`). If a future model misreads it, the note can be revised in one place. |
| `Cmd+.` collides with another shortcut | Low | Check `useKeyboardShortcuts.ts` for existing `.` bindings. The library already supports a modifier-aware key map. |

## 6. Out of scope (explicitly)

- Backend MCP changes — `mcp-server.ts`, `app-api-routes.ts`, `api-routes.ts` are untouched.
- Prompt doctrine — no changes to `buildAgentSystemPrompt`, the system instruction assembly at `App.tsx:604-606`, or the model orchestration.
- COHORT, credentials, key rotation, OAuth.
- Mobile (`@expo/ui`) and tablet layouts — the Chat panel is identical across form factors; no per-form-factor changes are needed.
- Cross-thread queue sharing — the queue is per-thread, reset on thread switch.
- Animations — the stop and queue transitions are instant. A follow-up could add a fade.

## 7. Dependency graph (parallel-safe steps)

```
Step 1 ──┐
         ├──> Step 2 ──> Step 3 ──┐
                                 ├──> Step 5 ──> Step 6 ──> Step 7
                                 ├──> Step 4 ──────────────────> Step 9
                                 ├──> Step 8
                                 ├──> Step 11
                                 ├──> Step 12
                                 ├──> Step 13 ──> Step 14 ──> Step 15
```

Steps 8, 9, 11, 12, 13 are independent of each other (different files / different sections of the same file). Steps 14, 15 depend on all of the above.

`handleStop`, `handleEnqueue`, `handleBargeNow` in `App.tsx` (Steps 3-4) and the prop interface in `Chat.tsx` (Step 5) are best done in a single commit to keep the type-check honest between intermediate states. Steps 7, 8, 9, 11, 12 can be split into their own commits if desired, but the verification requires all of them to land before the manual smoke test runs.

## 8. Acceptance criteria

The patch is complete when, in the running dev server:

1. The user can stop a turn with a single click on a stop button next to the send button.
2. The user can `Cmd+.` to stop a turn.
3. The user can type a message and press Enter while a turn is in flight, and the message goes to a visible queue strip instead of being lost.
4. The user can click "send all now" on the queue strip to barge, and the current turn is cancelled and the queued message is processed next.
5. The user can click the stop button alone (no queue flush), and the streaming message is removed.
6. The user can edit and cancel queued messages.
7. A barge message persists the bracketed note into the thread and shows it in the bubble.
8. Queue is session-local; reloading the app clears the queue.
9. `npm run type-check` and `npm run test` pass.

## 9. Rollback strategy

Each step is a single focused commit. To roll back:
- Steps 1-2 (abort surface): revert the commit. No public API change; safe.
- Steps 3-6 (App.tsx state + props): revert the commit. The Chat props revert to the original 9, and the new state is gone.
- Steps 7-13 (Chat.tsx UI): revert the commit. The form is back to disabled-while-loading; the queue strip is gone.
- Steps 14-15 (tests, docs): revert independently.

There is no migration of persisted data — the queue is not persisted (Step 10), and the barge note is part of the message content (not metadata), so threads remain readable after rollback.
