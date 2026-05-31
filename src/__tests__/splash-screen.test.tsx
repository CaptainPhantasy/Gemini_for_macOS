import { afterEach, describe, expect, test, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { SplashScreen } from '../components/SplashScreen';

let root: Root | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  document.body.innerHTML = '';
});

describe('SplashScreen', () => {
  test('uses rereadme cover as the primary loading video', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);

    act(() => {
      root?.render(<SplashScreen onComplete={vi.fn()} />);
    });

    const sources = Array.from(host.querySelectorAll('source')).map((source) => source.getAttribute('src'));
    expect(sources[0]).toBe('/rereadme-cover.mp4');
    expect(sources).toContain('/splash.mp4');
  });
});
