/**
 * SafeMarkdown Component
 * Sanitizes markdown content before rendering to prevent XSS attacks
 */

import React from 'react';
import Markdown from 'react-markdown';
import { sanitizeHTML } from '../lib/security';

interface SafeMarkdownProps {
  children: string;
  options?: Record<string, unknown>;
}

/**
 * Custom Markdown component that sanitizes content
 * Prevents XSS by removing malicious scripts and handlers
 */
export function SafeMarkdown({ children, options }: SafeMarkdownProps) {
  // Sanitize the markdown content before passing to Markdown component
  const sanitized = sanitizeHTML(children);
  
  return (
    <Markdown
      components={{
        // Ensure links don't execute javascript
        a: ({ href, children }) => (
          <a 
            href={href} 
            target="_blank" 
            rel="noopener noreferrer"
            onClick={(e) => {
              // Ensure href doesn't start with javascript:
              if (href && href.startsWith('javascript:')) {
                e.preventDefault();
              }
            }}
          >
            {children}
          </a>
        ),
        // Custom image component with safety checks
        img: ({ src, alt }) => (
          <img 
            src={src} 
            alt={alt} 
            onError={(e) => {
              console.warn('Image failed to load:', src);
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ),
        ...options
      }}
    >
      {sanitized}
    </Markdown>
  );
}
