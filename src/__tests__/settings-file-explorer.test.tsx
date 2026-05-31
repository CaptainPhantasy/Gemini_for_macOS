import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { Settings, parseDirectoryEntries } from '../components/Settings';
import { DEFAULT_MODEL_SETTINGS, type AppSettings } from '../types';

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
  const changeHandler = props?.onChange as ((event: { target: { value: string } }) => void) | undefined;
  changeHandler?.({ target: { value } });
}

const settings: AppSettings = {
  theme: 'gemini',
  autonomyMode: 'ask',
  directoryLock: { enabled: false, rootPath: '' },
  googleDriveEnabled: true,
  notebookLmEnabled: true,
  searchEnabled: true,
  mcpServers: [],
  geminiApiKey: '',
  gcpOAuthClientId: '',
  autoSyncArtifacts: true,
  models: DEFAULT_MODEL_SETTINGS,
};

function renderSettings() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  containers.push(container);

  act(() => {
    root.render(<Settings onClose={() => {}} settings={settings} onUpdateSettings={() => {}} />);
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

describe('Desktop Commander allowlist file explorer', () => {
  test('parses directory-only Desktop Commander listings into child paths', () => {
    expect(parseDirectoryEntries('[DIR] Applications\n[FILE] .DS_Store\n[DIR] Users', '/')).toEqual([
      { name: 'Applications', path: '/Applications' },
      { name: 'Users', path: '/Users' },
    ]);
    expect(parseDirectoryEntries('[DIR] Utilities\n[FILE] Notes.app', '/Applications')).toEqual([
      { name: 'Utilities', path: '/Applications/Utilities' },
    ]);
  });

  test('browses Desktop Commander directories and adds a selected path to the allowlist draft', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/diagnostic')) {
        return new Response(JSON.stringify({ advanced: { mcp_server: { status: 'connected', tools_available: 26, url: 'ws://localhost:13001/mcp' } } }), { status: 200 });
      }
      if (url.includes('/api/desktop-commander/config')) {
        return new Response(JSON.stringify({ advanced: { config: { allowedDirectories: [] } } }), { status: 200 });
      }
      if (url.includes('/api/execute?action=list_directory')) {
        return new Response(JSON.stringify({ status: 'success', result: '[DIR] Utilities\n[FILE] Notes.app' }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });

    const container = renderSettings();
    await act(async () => {
      await Promise.resolve();
    });

    const explorerInput = container.querySelector<HTMLInputElement>('input[aria-label="Directory explorer path"]');
    const allowlist = container.querySelector<HTMLTextAreaElement>('#settings-dc-allowed-directories');
    const browseButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Browse'));

    expect(explorerInput).not.toBeNull();
    expect(allowlist).not.toBeNull();
    expect(browseButton).not.toBeNull();

    await act(async () => {
      dispatchInputChange(explorerInput!, '/Applications');
      browseButton!.click();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/execute?action=list_directory&path=%2FApplications'),
      { method: 'POST' },
    );
    expect(container.textContent).toContain('Utilities');

    const addButtons = Array.from(container.querySelectorAll('button')).filter((button) => button.textContent?.trim() === 'Add');
    await act(async () => {
      addButtons[addButtons.length - 1]!.click();
    });

    expect(allowlist!.value).toBe('/Applications/Utilities');
  });
});
