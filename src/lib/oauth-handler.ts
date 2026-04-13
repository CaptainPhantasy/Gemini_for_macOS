/**
 * OAuth Token Handler
 * 
 * SECURITY: OAuth tokens should NEVER be stored in localStorage (vulnerable to XSS)
 * Best practices:
 * 1. Use HttpOnly, Secure, SameSite cookies (handled by backend)
 * 2. Backend sets cookies, frontend doesn't need to access the token
 * 3. Cookies are automatically included in cross-origin requests with credentials
 * 4. If token needed in frontend, use a secure session storage pattern
 */

/**
 * Request a Google OAuth token from the backend
 * The backend handles OAuth flow and returns an HttpOnly cookie
 */
export async function requestGoogleOAuthToken(scopes: string[]): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/google/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // Include cookies
      body: JSON.stringify({ scopes })
    });
    
    if (!response.ok) {
      console.error('Failed to request OAuth token:', response.statusText);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('OAuth token request failed:', error);
    return false;
  }
}

/**
 * Revoke OAuth token via backend
 */
export async function revokeGoogleOAuthToken(): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/google/revoke', {
      method: 'POST',
      credentials: 'include'
    });
    
    if (!response.ok) {
      console.error('Failed to revoke token:', response.statusText);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Token revocation failed:', error);
    return false;
  }
}

/**
 * Check if user is authenticated with Google
 * Backend checks if HttpOnly cookie exists
 */
export async function checkGoogleAuthStatus(): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/google/status', {
      method: 'GET',
      credentials: 'include'
    });
    
    if (!response.ok) {
      return false;
    }
    
    const data = await response.json();
    return data.authenticated === true;
  } catch (error) {
    console.error('Failed to check auth status:', error);
    return false;
  }
}

/**
 * DEPRECATED: DO NOT USE - Previously stored tokens in localStorage
 * @deprecated Token should never be stored in localStorage
 * Use backend API with HttpOnly cookies instead
 */
export function getStoredToken(): string | null {
  // Return null - tokens should be in HttpOnly cookies
  console.warn(
    'getStoredToken() is deprecated. ' +
    'Tokens should be managed by backend via HttpOnly cookies. ' +
    'Frontend API calls should use fetch with credentials: "include"'
  );
  return null;
}
