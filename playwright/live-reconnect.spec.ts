import { test, expect } from '@playwright/test';

/**
 * Smoke test for the Live Mode entry point and modal chooser.
 *
 * NOTE: This is intentionally smoke-level. The `LiveSession` class wraps the
 * `@google/genai` SDK's WebSocket transport, which Playwright cannot mock from
 * the page context without significant scaffolding (route interception only
 * handles HTTP, not the SDK's bidi socket). Real reconnect coverage requires
 * either:
 *   1. A page-side stub that monkey-patches `window.WebSocket` before the
 *      SDK boots, or
 *   2. Refactoring `LiveSession` to accept an injected transport so tests can
 *      pass a fake.
 *
 * Both are tracked as Plan v3 Phase 10 follow-ups. For now we verify the UI
 * surfaces the chooser correctly so a regression in the entry path is caught.
 */

test.describe('Live mode entry', () => {
  test('Live Mode sidebar entry opens the chooser modal', async ({ page }) => {
    await page.goto('http://localhost:13000/gemini/');

    const splashVideo = page.locator('video').first();
    await expect(splashVideo).toBeAttached({ timeout: 15_000 });
    await splashVideo.evaluate((node) => {
      node.dispatchEvent(new Event('ended', { bubbles: true }));
    });


    // Splash screen renders briefly on cold load — wait it out by waiting for
    // the workspace surface (Sidebar role landmark + main chat region).
    const main = page.getByRole('main', { name: /main chat area/i });
    await expect(main).toBeVisible({ timeout: 15_000 });

    // Open Live via the desktop vertical header. Older shells exposed this as
    // "Live Mode"; keep the matcher tolerant so the smoke test tracks the
    // user-facing entry point rather than a specific label variant.
    const liveModeTrigger = page
      .getByRole('button', { name: /^live(?: mode)?$/i })
      .or(page.getByText(/^live(?: mode)?$/i).first());
    await liveModeTrigger.first().click();

    // The LiveChooser exposes three modes — Voice, Camera, Screen.
    // Use forgiving regex so minor copy edits don't break the smoke test.
    const voiceButton = page.getByRole('button', { name: /voice/i });
    const cameraButton = page.getByRole('button', { name: /camera/i });
    const screenButton = page.getByRole('button', { name: /screen/i });

    await expect(voiceButton.first()).toBeVisible({ timeout: 5_000 });
    await expect(cameraButton.first()).toBeVisible();
    await expect(screenButton.first()).toBeVisible();

    // Close the modal via Escape (standard close affordance for portals).
    await page.keyboard.press('Escape');
  });

  test.skip('LiveSession reconnects after WebSocket drop', async () => {
    // Follow-up: requires a window.WebSocket stub or injected transport.
    // See test.describe header for the full rationale.
  });
});
