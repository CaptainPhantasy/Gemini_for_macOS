/**
 * LiveMode — thin entry point that switches between {@link LiveChooser} and
 * {@link LiveSessionPanel} based on the user's mode selection.
 *
 * The previous implementation tried to manage MediaStream state inline with a
 * `videoRef.current` guard that caused a chicken-and-egg bug: the video
 * element was conditionally rendered based on stream presence, so the ref was
 * always null at the moment we tried to attach the stream. The rewrite splits
 * the surface into a chooser and a panel so the video element is always
 * mounted as soon as a video mode is active.
 *
 * Existing call sites that import `<LiveMode isOpen={...} onClose={...} />`
 * keep working unchanged.
 */
import { useState } from 'react';

import { LiveChooser, type LiveModeKind } from './LiveChooser';
import { LiveSessionPanel } from './LiveSessionPanel';

export { LiveChooser } from './LiveChooser';
export type { LiveModeKind, LiveChooserProps } from './LiveChooser';
export { LiveSessionPanel } from './LiveSessionPanel';
export type { LiveSessionPanelProps } from './LiveSessionPanel';

export interface LiveModeProps {
  /**
   * Optional. Defaults to `true` when omitted so existing call sites that
   * conditionally render `<LiveMode onClose={...} />` keep working without
   * modification.
   */
  isOpen?: boolean;
  onClose: () => void;
  modelId?: string;
  systemInstruction?: string;
  voiceName?: string;
  onSessionEnd?: (transcript: string, metadata: Record<string, unknown>) => void;
}

export function LiveMode({
  isOpen = true,
  onClose,
  modelId,
  systemInstruction,
  voiceName,
  onSessionEnd,
}: LiveModeProps) {
  const [mode, setMode] = useState<LiveModeKind | null>(null);

  if (!isOpen) return null;

  const handleClose = () => {
    setMode(null);
    onClose();
  };

  if (mode === null) {
    return (
      <LiveChooser isOpen={isOpen} onClose={handleClose} onSelect={(next) => setMode(next)} />
    );
  }

  return (
    <LiveSessionPanel
      mode={mode}
      onClose={handleClose}
      modelId={modelId}
      systemInstruction={systemInstruction}
      voiceName={voiceName}
      onSessionEnd={onSessionEnd}
    />
  );
}

export default LiveMode;
