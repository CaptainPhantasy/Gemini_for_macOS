# Chat Generation Abort (Client-Side)

The streaming generation entry point at `src/lib/generation-wrapper.ts:generateWithFailoverStream` accepts an optional `AbortSignal` via the `signal?: AbortSignal` field on `GenerationOptions`. This is the abort lever for the Chat barge-in and queue features (see `docs/plans/chat-barge-and-queue.md`).

## Behavior

The signal is propagated to the `@google/genai` SDK as `abortSignal` on the `generateContentStream` call. Per the SDK's documented behavior, this is a client-side cancel: it stops the consumer from receiving more chunks but does not cancel the upstream network request at the Gemini service. You will still be charged for tokens generated up to the abort point.

The wrapper also checks `signal.aborted` between chunks and between retry attempts. If the signal is already aborted when the call is invoked, the wrapper throws `DOMException` with `name === 'AbortError'` without making any SDK call.

If the primary model is in a retry loop, an `AbortError` from a `runStream` call short-circuits the retries: the wrapper re-throws the `AbortError` instead of treating it as a transient error and retrying with exponential backoff. The fallback model is also skipped. An abort cancels the entire turn.

A tool mid-execution at abort time is NOT rolled back. Its effects (for example, partial file writes) persist, matching the Claude Code behavior.

## App-level wiring

`App.tsx` maintains a single `useRef<AbortController | null>(null)` named `abortRef`. A fresh `AbortController` is created at the top of `handleSendMessage` and cleared in the `finally` block.

The `signal: abortRef.current?.signal` is passed to `generateWithFailoverStream` inside the streaming loop.

`handleStop()` calls `abortRef.current?.abort()`. It is wired to the Chat stop button in `src/components/Chat.tsx` and the `Cmd+.` keyboard shortcut.

`handleBargeNow()` calls `abortRef.current?.abort()` and then re-enters `handleSendMessage` with the first queued message prefixed by a bracketed system note.

## Catch path

The `catch (error)` arm in `handleSendMessage` checks for `error instanceof DOMException && error.name === 'AbortError'`. On AbortError, it clears the streaming message and logs a warning instead of showing a user-facing alert.

## AbortController wiring example

```ts
const abortRef = useRef<AbortController | null>(null);

async function handleSendMessage(content: string) {
  setIsLoading(true);
  abortRef.current = new AbortController();
  try {
    await generateWithFailoverStream({
      ai,
      model: 'gemini-3.1-pro-preview',
      contents: workingContents,
      config: generationConfig,
      signal: abortRef.current.signal,
      onChunk: (chunk) => { responseText = chunk.aggregatedText; },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      clearStreamingModelMessage();
    } else {
      throw err;
    }
  } finally {
    setIsLoading(false);
    abortRef.current = null;
  }
}

function handleStop() {
  if (abortRef.current) abortRef.current.abort();
}
```

## SDK documentation reference

`GenerateContentParameters.abortSignal?: AbortSignal` at `node_modules/@google/genai/dist/genai.d.ts:4338`. The SDK JSDoc warns: "AbortSignal is a client-only operation. Using it to cancel an operation will not cancel the request in the service. You will still be charged usage for any applicable operations."

## Related test

`src/__tests__/generation-wrapper.test.ts` includes three new tests:
- `propagates AbortSignal to the SDK as abortSignal`
- `throws AbortError synchronously when signal is already aborted`
- `aborts mid-stream and does not retry or fall back`

All three pass. The full vitest suite (38 files, 194 tests + 1 documented expected-fail) is green.
