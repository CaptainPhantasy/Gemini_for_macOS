/**
 * Security Headers Configuration
 * 
 * Content Security Policy (CSP) and other security headers
 * These headers should be set by the backend server or deployed platform
 */

/**
 * Recommended CSP header for Gemini AI Studio applets
 * 
 * In production, set via:
 * - Cloud Run: metadata or nginx/apache config
 * - Express: helmet middleware
 * - Vercel: vercel.json headers
 */
export const SECURITY_HEADERS = {
  // Prevent cross-site scripting (XSS) - blocks inline scripts and eval
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",
    "media-src 'self' https:",
    "connect-src 'self' https://generativelanguage.googleapis.com wss://localhost:3001",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; '),

  // Prevent clickjacking attacks
  'X-Frame-Options': 'SAMEORIGIN',

  // Disable MIME type sniffing
  'X-Content-Type-Options': 'nosniff',

  // Enable XSS protection in older browsers
  'X-XSS-Protection': '1; mode=block',

  // Prevent sending referrer information
  'Referrer-Policy': 'strict-origin-when-cross-origin',

  // Control permissions for features like camera, microphone
  'Permissions-Policy': [
    'camera=self',
    'microphone=self',
    'geolocation=self'
  ].join(', ')
};

/**
 * Express middleware to set security headers
 * Usage: app.use(setSecurityHeaders);
 */
export function setSecurityHeaders(req: any, res: any, next: any) {
  Object.entries(SECURITY_HEADERS).forEach(([header, value]) => {
    res.setHeader(header, value);
  });
  next();
}

/**
 * Configuration for vercel.json to set headers
 */
export const VERCEL_HEADERS_CONFIG = [
  {
    source: '/(.*)',
    headers: Object.entries(SECURITY_HEADERS).map(([key, value]) => ({
      key,
      value
    }))
  }
];
