import { test, expect, type Page } from '@playwright/test';

async function openAt(page: Page, width: number, height: number, path = '/') {
  await page.setViewportSize({ width, height });
  await page.addInitScript(() => {
    const nativeSetTimeout = window.setTimeout;
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
      nativeSetTimeout(handler, timeout === 9000 ? 0 : timeout, ...args)) as typeof window.setTimeout;
  });
  await page.goto(path);

  // The production splash has a 9s media failsafe. Tests exercise shell layout,
  // so fire the same completion path through the video ended event instead of
  // waiting for media playback in every viewport case.
  const splashVideo = page.locator('video').first();
  if (await splashVideo.count()) {
    await splashVideo.evaluate((node) => {
      node.dispatchEvent(new Event('ended', { bubbles: true }));
    });
  }

  const shell = page.locator('[data-shell-mode]');
  await expect(shell).toBeVisible({ timeout: 15_000 });
  return shell;
}

test.describe('adaptive shell layout', () => {
  test('compact mode is phone-first with an accessible sidebar drawer', async ({ page }) => {
    const shell = await openAt(page, 375, 812);
    await expect(shell).toHaveAttribute('data-shell-mode', 'compact');
    await expect(shell).toHaveAttribute('data-shell-vertical', 'mobile');
    await expect(page.getByRole('region', { name: /phone focus interface/i })).toBeVisible();
    await expect(page.getByRole('navigation', { name: /phone quick actions/i })).toBeVisible();
    await expect(page.locator('.official-gemini-gel')).toHaveAttribute('src', '/gemini/vendor/official-gemini/GelIdle.mp4');
    await expect(page.locator('.vertical-header-lottie')).toHaveCount(1);
    const menu = page.getByRole('button', { name: /open sidebar/i });
    const menuButton = page.locator('#compact-menu-button');
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');

    const box = await menu.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);

    await menu.click();
    await expect(menuButton).toHaveAttribute('aria-label', 'Close sidebar');
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#compact-sidebar')).toHaveClass(/open/);
    await expect(page.locator('.mobile-backdrop')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(menuButton).toHaveAttribute('aria-label', 'Open sidebar');
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#compact-sidebar')).not.toHaveClass(/open/);
    await expect(menuButton).toBeFocused();
  });

  test('medium mode uses a tablet command deck without compact hamburger chrome', async ({ page }) => {
    const shell = await openAt(page, 768, 1024);
    await expect(shell).toHaveAttribute('data-shell-mode', 'medium');
    await expect(shell).toHaveAttribute('data-shell-vertical', 'tablet');

    await expect(page.locator('.tablet-sidebar-pane')).toBeVisible();
    await expect(page.getByRole('region', { name: /tablet command deck interface/i })).toBeVisible();
    await expect(page.locator('.official-gemini-gel')).toHaveAttribute('src', '/gemini/vendor/official-gemini/GelIdle.mp4');
    await expect(page.locator('.vertical-header-lottie')).toHaveCount(1);
    await expect(page.locator('.mobile-hamburger')).toHaveCount(0);
    await expect(page.locator('.tablet-canvas-sheet')).toHaveCount(0);
  });

  test('large tablet width remains medium until the expanded breakpoint', async ({ page }) => {
    const shell = await openAt(page, 1194, 834);
    await expect(shell).toHaveAttribute('data-shell-mode', 'medium');
    await expect(shell).toHaveAttribute('data-shell-vertical', 'tablet');
    await expect(page.locator('.tablet-sidebar-pane')).toBeVisible();
  });

  test('explicit vertical routes select mobile, tablet, and desktop shells independent of viewport', async ({ page }) => {
    let shell = await openAt(page, 1366, 900, '/gemini/mobile');
    await expect(shell).toHaveAttribute('data-shell-mode', 'compact');
    await expect(shell).toHaveAttribute('data-shell-vertical', 'mobile');
    await expect(page.locator('.mobile-hamburger')).toBeVisible();
    await expect(page.getByRole('navigation', { name: /phone quick actions/i })).toBeVisible();

    shell = await openAt(page, 1366, 900, '/gemini/tablet');
    await expect(shell).toHaveAttribute('data-shell-mode', 'medium');
    await expect(shell).toHaveAttribute('data-shell-vertical', 'tablet');
    await expect(page.locator('.tablet-sidebar-pane')).toBeVisible();
    await expect(page.getByRole('region', { name: /tablet command deck interface/i })).toBeVisible();

    shell = await openAt(page, 375, 812, '/gemini/desktop');
    await expect(shell).toHaveAttribute('data-shell-mode', 'expanded');
    await expect(shell).toHaveAttribute('data-shell-vertical', 'desktop');
    await expect(page.getByRole('region', { name: /desktop operations bridge interface/i })).toBeVisible();
    await expect(page.locator('aside[aria-label="Artifact canvas"]')).toBeVisible();
  });

  test('expanded mode preserves the desktop three-pane operations bridge', async ({ page }) => {
    const shell = await openAt(page, 1366, 900);
    await expect(shell).toHaveAttribute('data-shell-mode', 'expanded');
    await expect(shell).toHaveAttribute('data-shell-vertical', 'desktop');

    await expect(page.locator('aside[aria-label="Navigation and artifact session tree"]')).toBeVisible();
    await expect(page.getByRole('main', { name: /desktop main chat area/i })).toBeVisible();
    await expect(page.getByRole('region', { name: /desktop operations bridge interface/i })).toBeVisible();
    await expect(page.locator('.official-gemini-gel')).toHaveAttribute('src', '/gemini/vendor/official-gemini/GelIdle.mp4');
    await expect(page.locator('.vertical-header-lottie')).toHaveCount(1);
    await expect(page.locator('aside[aria-label="Artifact canvas"]')).toBeVisible();
    await expect(page.locator('.mobile-hamburger')).toHaveCount(0);
  });

  test('resize transitions clear stale compact drawer state', async ({ page }) => {
    const shell = await openAt(page, 375, 812);
    await expect(shell).toHaveAttribute('data-shell-mode', 'compact');

    const menu = page.getByRole('button', { name: /open sidebar/i });
    const menuButton = page.locator('#compact-menu-button');
    await menu.click();
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true');

    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(shell).toHaveAttribute('data-shell-mode', 'medium');
    await expect(shell).toHaveAttribute('data-shell-vertical', 'tablet');
    await expect(page.locator('#compact-sidebar')).toHaveCount(0);

    await page.setViewportSize({ width: 1200, height: 900 });
    await expect(shell).toHaveAttribute('data-shell-mode', 'expanded');
    await expect(shell).toHaveAttribute('data-shell-vertical', 'desktop');

    await page.setViewportSize({ width: 767, height: 812 });
    await expect(shell).toHaveAttribute('data-shell-mode', 'compact');
    await expect(shell).toHaveAttribute('data-shell-vertical', 'mobile');
    const compactMenu = page.getByRole('button', { name: /open sidebar/i });
    await expect(compactMenu).toHaveAttribute('aria-expanded', 'false');
  });
});
