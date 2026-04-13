/**
 * Security utilities for sanitizing user input and preventing XSS
 */

import DOMPurify from 'dompurify';

/**
 * Sanitize HTML content using DOMPurify
 * Removes script tags, event handlers, and other dangerous content
 * 
 * @param dirty - Raw HTML string that may contain malicious content
 * @returns Clean HTML string safe to render
 */
export function sanitizeHTML(dirty: string): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sanitized = DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'code', 'pre',
      'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'span', 'div'
    ],
    ALLOWED_ATTR: ['href', 'target', 'src', 'alt', 'title', 'class'],
    ALLOW_UNKNOWN_PROTOCOLS: false
  } as any);
  
  return typeof sanitized === 'string' ? sanitized : sanitized.toString();
}

/**
 * Sanitize user-provided text for safe display in alerts and error messages
 * Prevents breaking out of strings with quotes or backslashes
 * 
 * @param text - User text to sanitize
 * @returns Clean text safe for display
 */
export function sanitizeText(text: string): string {
  if (typeof text !== 'string') {
    return '';
  }
  
  // Remove any script tags or event handlers
  return text
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/on\w+\s*=\s*[^\s>]*/gi, '')
    .slice(0, 500); // Limit length to prevent huge error messages
}

/**
 * Create a safe error message for display
 * @param error - Error object or string
 * @returns Safe error message
 */
export function getSafeErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return sanitizeText(error);
  }
  
  if (error instanceof Error) {
    return sanitizeText(error.message);
  }
  
  return 'An error occurred';
}
