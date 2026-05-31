import { type Page, expect, test } from '@playwright/test';

async function openAt(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.addInitScript(() => {
    const nativeSetTimeout = window.setTimeout;
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
      nativeSetTimeout(handler, timeout === 9000 ? 0 : timeout, ...args)) as typeof window.setTimeout;
  });
  await page.goto('/');

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

test.describe('sidebar overlay routing', () => {
  test('opens Integrations, Settings, and Gems Registry from their sidebar actions', async ({ page }) => {
    const shell = await openAt(page, 1100, 800);
    await expect(shell).toHaveAttribute('data-shell-mode', 'medium');

    await page.getByRole('button', { name: 'Integrations' }).click();
    await expect(page.getByRole('heading', { name: 'Integrations' })).toBeVisible();
    await page.getByRole('button', { name: 'Close integrations' }).click();
    await expect(page.getByRole('heading', { name: 'Integrations' })).not.toBeVisible();

    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'System Settings' })).toBeVisible();
    await page.getByRole('button', { name: 'Close settings' }).click();
    await expect(page.getByRole('heading', { name: 'System Settings' })).not.toBeVisible();

    await page.getByRole('button', { name: 'Gems Registry' }).click();
    await expect(page.getByRole('heading', { name: 'Gems Registry' })).toBeVisible();
    await page.getByRole('button', { name: 'Close gems registry' }).click();
    await expect(page.getByRole('heading', { name: 'Gems Registry' })).not.toBeVisible();
  });
});
