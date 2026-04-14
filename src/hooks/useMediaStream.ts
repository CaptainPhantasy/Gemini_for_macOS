/**
 * useMediaStream — React hook for managing microphone, camera, and screen
 * media streams wired into an active {@link LiveSession}.
 *
 * Ported from RAGBOT3000 (hooks/useMediaStream.ts). No functional adaptations;
 * imports updated for GEMINI for macOS module layout.
 */
import { useCallback, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { LiveSession } from '../lib/live-session';

export type CameraFacingMode = 'user' | 'environment';
export type VideoSource = 'camera' | 'screen';

export const useMediaStream = (
  liveSessionRef: RefObject<LiveSession | null>,
  videoPreviewRef: RefObject<HTMLVideoElement | null>,
) => {
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [cameraFacingMode, setCameraFacingMode] = useState<CameraFacingMode>('user');
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);

  const setupAudio = useCallback(async (): Promise<boolean> => {
    if (streamRef.current && audioContextRef.current && analyser) {
      return true;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const newAnalyser = audioContext.createAnalyser();
      newAnalyser.fftSize = 512;
      newAnalyser.smoothingTimeConstant = 0.3;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(newAnalyser);
      setAnalyser(newAnalyser);
      return true;
    } catch (err) {
      console.error('Mic permission denied:', err);
      return false;
    }
  }, [analyser]);

  const stopVideoSource = useCallback(
    (session?: LiveSession | null) => {
      // Stop any existing video stream tracks
      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach((track) => track.stop());
        videoStreamRef.current = null;
      }
      // Allow callers to stop the previous session even if liveSessionRef has
      // already been cleared.
      (session ?? liveSessionRef.current)?.stopVideoStream();
      setIsScreenSharing(false);
      setIsCameraActive(false);
    },
    [liveSessionRef],
  );

  const startVideoSource = useCallback(
    async (type: VideoSource): Promise<{ success: boolean; error?: string }> => {
      if (!liveSessionRef.current) {
        return { success: false, error: 'Session not initialized' };
      }

      try {
        stopVideoSource();

        // Check support before attempting
        if (type === 'screen' && !navigator.mediaDevices?.getDisplayMedia) {
          return {
            success: false,
            error: 'Screen sharing is not supported on this device or browser.',
          };
        }

        if (type === 'camera' && !navigator.mediaDevices?.getUserMedia) {
          return {
            success: false,
            error: 'Camera access is not supported on this device or browser.',
          };
        }

        const stream =
          type === 'screen'
            ? await navigator.mediaDevices.getDisplayMedia({
                video: {
                  displaySurface: 'browser', // Prefer browser tab/window over entire screen
                  cursor: 'always',
                } as MediaTrackConstraints,
              })
            : await navigator.mediaDevices.getUserMedia({
                video: {
                  facingMode: cameraFacingMode,
                },
              });

        // Store video stream reference for camera toggling
        if (type === 'camera') {
          videoStreamRef.current = stream;
        }

        liveSessionRef.current.startVideoStream(stream);

        if (type === 'screen') setIsScreenSharing(true);
        else setIsCameraActive(true);

        setTimeout(() => {
          if (videoPreviewRef.current) {
            videoPreviewRef.current.srcObject = stream;
          }
        }, 100);

        stream.getVideoTracks()[0].onended = () => {
          stopVideoSource();
        };

        return { success: true };
      } catch (err: unknown) {
        console.error(`Failed to start ${type}:`, err);
        setIsScreenSharing(false);
        setIsCameraActive(false);

        let errorMsg = `Failed to start ${type === 'screen' ? 'screen sharing' : 'camera'}.`;

        const domErr = err as { name?: string; message?: string };
        if (domErr.name === 'NotAllowedError' || domErr.name === 'PermissionDeniedError') {
          errorMsg =
            type === 'screen'
              ? 'Screen sharing permission denied. Please allow screen sharing in your browser settings.'
              : 'Camera permission denied. Please allow camera access and try again.';
        } else if (domErr.name === 'NotFoundError' || domErr.name === 'DevicesNotFoundError') {
          errorMsg =
            type === 'screen'
              ? 'No screen or window available to share.'
              : 'No camera found. Please connect a camera and try again.';
        } else if (domErr.name === 'NotReadableError' || domErr.name === 'TrackStartError') {
          errorMsg = `Unable to access ${
            type === 'screen' ? 'screen' : 'camera'
          }. It may be in use by another application.`;
        } else if (domErr.message) {
          errorMsg = domErr.message;
        }

        return { success: false, error: errorMsg };
      }
    },
    [liveSessionRef, videoPreviewRef, stopVideoSource, cameraFacingMode],
  );

  const toggleCamera = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!isCameraActive || !liveSessionRef.current) {
      return { success: false, error: 'Camera is not active' };
    }

    // Stop current video stream
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach((track) => track.stop());
      videoStreamRef.current = null;
    }
    liveSessionRef.current.stopVideoStream();

    // Toggle facing mode
    const newFacingMode: CameraFacingMode = cameraFacingMode === 'user' ? 'environment' : 'user';
    setCameraFacingMode(newFacingMode);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: newFacingMode,
        },
      });

      videoStreamRef.current = stream;
      liveSessionRef.current.startVideoStream(stream);

      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
      }

      stream.getVideoTracks()[0].onended = () => {
        stopVideoSource();
      };

      return { success: true };
    } catch (err: unknown) {
      console.error('Failed to toggle camera:', err);
      // Revert facing mode on error
      setCameraFacingMode(cameraFacingMode);

      let errorMsg = 'Failed to switch camera.';
      const domErr = err as { name?: string };
      if (domErr.name === 'NotAllowedError') {
        errorMsg = 'Camera permission denied.';
      } else if (domErr.name === 'NotFoundError') {
        errorMsg =
          newFacingMode === 'environment'
            ? 'Back camera not available on this device.'
            : 'Front camera not available on this device.';
      } else if (domErr.name === 'OverconstrainedError') {
        errorMsg =
          newFacingMode === 'environment'
            ? 'Back camera not supported on this device.'
            : 'Front camera not supported on this device.';
      }

      return { success: false, error: errorMsg };
    }
  }, [isCameraActive, cameraFacingMode, liveSessionRef, videoPreviewRef, stopVideoSource]);

  return {
    isScreenSharing,
    isCameraActive,
    cameraFacingMode,
    analyser,
    streamRef,
    audioContextRef,
    setupAudio,
    startVideoSource,
    stopVideoSource,
    toggleCamera,
    setIsScreenSharing,
    setIsCameraActive,
    setAnalyser,
  };
};
