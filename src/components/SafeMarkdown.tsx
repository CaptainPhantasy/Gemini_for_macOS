/**
 * SafeMarkdown Component
 * Renders markdown safely, preventing XSS attacks.
 *
 * Architecture:
 *  - react-markdown is safe by default: it does NOT pass raw HTML through
 *    (no rehype-raw is used), so `<script>` and other tags in markdown
 *    source are rendered as literal text, not executed.
 *  - We additionally run DOMPurify over the rendered DOM as defense-in-depth
 *    via a ref-based post-render sanitization pass.
 *  - Crucially, we do NOT pre-sanitize the markdown source string. Doing so
 *    caused `<` characters inside code fences to be escaped to `&lt;` before
 *    react-markdown saw them, producing literal `&lt;` in code blocks.
 */

import React, { useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import DOMPurify from 'dompurify';

interface SafeMarkdownProps {
  children: string;
  options?: Record<string, unknown>;
}

/**
 * Custom Markdown component that sanitizes rendered output.
 * Prevents XSS by removing malicious scripts and handlers from the DOM
 * after react-markdown produces it.
 */
export function SafeMarkdown({ children, options }: SafeMarkdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Defense-in-depth: after render, sanitize the produced DOM in place.
  // react-markdown is already safe by default, but this enforces the
  // allowlist of tags/attrs at the DOM level.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const cleaned = DOMPurify.sanitize(node.innerHTML, {
      ALLOWED_TAGS: [
        'b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'code', 'pre',
        'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'span', 'div'
      ],
      ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'title', 'class'],
      ALLOW_UNKNOWN_PROTOCOLS: false,
    } as Parameters<typeof DOMPurify.sanitize>[1]);

    if (typeof cleaned === 'string' && cleaned !== node.innerHTML) {
      node.innerHTML = cleaned;
    }
  }, [children]);

  return (
    <div ref={containerRef}>
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
          ...options,
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}
