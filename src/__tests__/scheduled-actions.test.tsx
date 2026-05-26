import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { ScheduledActions } from '../components/ScheduledActions';
import { storage } from '../lib/storage';
import type { ScheduledAction } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let roots: Root[] = [];
let containers: HTMLElement[] = [];

function renderScheduledActions(onRunPrompt: (prompt: string) => Promise<void> | void) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  containers.push(container);

  act(() => {
    root.render(<ScheduledActions onClose={() => {}} onRunPrompt={onRunPrompt} />);
  });

  return container;
}

afterEach(() => {
  for (const root of roots) {
    act(() => root.unmount());
  }
  for (const container of containers) {
    container.remove();
  }
  roots = [];
  containers = [];
  vi.restoreAllMocks();
});

describe('ScheduledActions', () => {
  test('Run Now sends the scheduled prompt through the app prompt callback', async () => {
    const action: ScheduledAction = {
      id: 'routine-1',
      cron: '0 9 * * *',
      prompt: 'Review the bonsai care queue using local files.',
      enabled: true,
    };
    vi.spyOn(storage, 'getScheduledActions').mockReturnValue([action]);
    const onRunPrompt = vi.fn(async () => undefined);

    const container = renderScheduledActions(onRunPrompt);
    const runNowButton = container.querySelector<HTMLButtonElement>('button[title="Run Now"]');

    expect(runNowButton).not.toBeNull();
    await act(async () => {
      runNowButton!.click();
    });

    expect(onRunPrompt).toHaveBeenCalledWith(action.prompt);
    expect(container.textContent).toContain('Queued scheduled action in chat');
  });
});
