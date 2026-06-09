// Vitest setup file — polyfills jsdom gaps that components in this repo need.
//
// These are all additive stubs. They do not alter behavior of any working
// test; they only fill in missing browser APIs that jsdom does not implement.
// See chat-barge-and-queue.md Step 14 for the rationale.

// 1. IS_REACT_ACT_ENVIRONMENT — required for React 18.3+ when state updates
//    are wrapped in act(). Without this, every wrapped act() emits a stderr
//    warning ("The current testing environment is not configured to support
//    act(...)") even when the act() correctly batches updates.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// 2. window.matchMedia — OfficialGeminiLottie.tsx:24 calls
//    window.matchMedia('(prefers-reduced-motion: reduce)') inside a useEffect.
//    jsdom does not implement matchMedia. Stub a minimal MediaQueryList so
//    the consumer's guard (`prefersReducedMotion = matchMedia(...)`) returns
//    false safely and the animation path runs.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  (window as unknown as { matchMedia: (q: string) => unknown }).matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,    // deprecated, but some libs still call it
    removeListener: () => undefined, // deprecated
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
}

// 3. Element.prototype.scrollIntoView — Chat.tsx:57 calls
//    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) inside
//    the auto-scroll useEffect. jsdom does not implement scrollIntoView.
//    Stub a no-op so the smart-scroll path does not throw.
if (typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView !== 'function') {
  (Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = function () {
    /* no-op for jsdom */
  };
}
