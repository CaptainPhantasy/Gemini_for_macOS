import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { ScheduledActions } from '../components/ScheduledActions';
import { storage } from '../lib/storage/storage';
import type { ScheduledAction } from '../types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let roots: Root[] = [];
let containers: HTMLElement[] = [];

function getReactProps<T extends Element>(element: T): Record<string, unknown> | null {
  const key = Object.keys(element as Record<string, unknown>).find((candidate) => candidate.startsWith('__reactProps$'));
  if (!key) return null;
  return (element as Record<string, unknown>)[key] as Record<string, unknown>;
}

function dispatchInputChange(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  input.value = value;
  const props = getReactProps(input);
  if (!props) return;
  const changeHandler = props.onChange as ((event: { target: { value: string } }) => void) | undefined;
  if (!changeHandler) return;
  changeHandler({ target: { value } } as { target: { value: string } });
}
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
    expect(container.textContent).toContain('Queued scheduled action in chat.');
  });

  test('does not save invalid cron expressions', async () => {
    const actionLog: ScheduledAction[] = [];
    vi.spyOn(storage, 'getScheduledActions').mockImplementation(() => actionLog);
    const saveScheduledAction = vi.spyOn(storage, 'saveScheduledAction').mockImplementation(async (action) => {
      actionLog.push(action);
    });

    const container = renderScheduledActions(async () => undefined);
    const cronInput = container.querySelector<HTMLInputElement>('input[aria-label="Cron expression"]');
    const promptInput = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Prompt to execute"]');
    const saveButton = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Schedule Action'));

    expect(cronInput).not.toBeNull();
    expect(promptInput).not.toBeNull();
    expect(saveButton).not.toBeNull();

    await act(async () => {
      dispatchInputChange(cronInput!, 'invalid-cron');
      dispatchInputChange(promptInput!, 'Check status');
      saveButton!.click();
      await Promise.resolve();
    });

    expect(saveScheduledAction).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Invalid cron expression');
    expect(container.textContent).toContain('No scheduled actions.');
  });

  test('saves valid cron expressions and shows action', async () => {
    const actionLog: ScheduledAction[] = [];
    const saveScheduledAction = vi.spyOn(storage, 'saveScheduledAction').mockImplementation(async (action) => {
      actionLog.push(action);
    });
    vi.spyOn(storage, 'getScheduledActions').mockImplementation(() => actionLog);

    const container = renderScheduledActions(async () => undefined);
    const cronInput = container.querySelector<HTMLInputElement>('input[aria-label="Cron expression"]');
    const promptInput = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Prompt to execute"]');
    const saveButtons = Array.from(container.querySelectorAll('button'))
      .filter((button) => button.textContent?.includes('Schedule Action'));
    const saveButton = saveButtons[0];

    expect(saveButtons.length).toBe(1);
    expect(cronInput).not.toBeNull();
    expect(promptInput).not.toBeNull();
    expect(saveButton).not.toBeNull();

    await act(async () => {
      dispatchInputChange(cronInput!, '0 9 * * *');
    });
    await act(async () => {
      dispatchInputChange(promptInput!, 'Check status');
    });
    await act(async () => {
      saveButton!.click();
      await Promise.resolve();
    });

    expect(saveScheduledAction).toHaveBeenCalledTimes(1);
    expect(actionLog).toHaveLength(1);
    expect(container.textContent).not.toContain('No scheduled actions.');
    expect(container.textContent).toContain('0 9 * * *');
    expect(container.textContent).toContain('Check status');
    expect(container.textContent).not.toContain('Invalid cron expression');
    expect(container.textContent).not.toContain('Cron and prompt are required to schedule an action.');

    expect(cronInput!.value).toBe('');
    expect(promptInput!.value).toBe('');
  });
});