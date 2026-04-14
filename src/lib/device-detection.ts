/**
 * Device detection utilities for mobile/PWA support
 *
 * Ported from RAGBOT3000 (lib/deviceDetection.ts) for GEMINI for macOS.
 */

export const isIOS = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
};

export const isMobile = (): boolean => {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
};

export const isStandalone = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
};

export const getPermissionStatus = async (
  permissionName: PermissionName,
): Promise<PermissionState | null> => {
  try {
    const result = await navigator.permissions.query({ name: permissionName });
    return result.state;
  } catch {
    return null;
  }
};

/**
 * Check if screen sharing is supported on this platform.
 * iOS Safari (including Chrome/Firefox on iOS) does NOT support getDisplayMedia.
 */
export const isScreenSharingSupported = (): boolean => {
  if (typeof window === 'undefined' || !navigator.mediaDevices) return false;

  // iOS devices don't support screen sharing
  if (isIOS()) return false;

  // Check if getDisplayMedia exists
  return typeof navigator.mediaDevices.getDisplayMedia === 'function';
};

/**
 * Check if camera access is supported.
 */
export const isCameraSupported = (): boolean => {
  if (typeof window === 'undefined' || !navigator.mediaDevices) return false;
  return typeof navigator.mediaDevices.getUserMedia === 'function';
};
