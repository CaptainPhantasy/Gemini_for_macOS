// SafeMarkdown: XSS-safe markdown renderer with code block copy support.
// react-markdown is safe by default (no rehype-raw). DOMPurify runs as defense-in-depth.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import DOMPurify from 'dompurify';
import { Copy, Check } from 'lucide-react';

interface SafeMarkdownProps {
  children: string;
  options?: Record<string, unknown>;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);
  return (
    <button onClick={handleCopy} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 transition-colors">
      {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
    </button>
  );
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
        'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'span', 'div',
        'button', 'svg', 'path', 'line', 'polyline'
      ],
      ALLOWED_ATTR: [
        'href', 'target', 'rel', 'src', 'alt', 'title', 'class',
        'xmlns', 'viewbox', 'width', 'height', 'fill', 'stroke',
        'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'd',
        'x1', 'y1', 'x2', 'y2', 'points',
      ],
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
          // Syntax-highlighted code blocks and inline code
          code: ({ className, children }) => {
            const match = /language-(\w+)/.exec(className || '');
            const text = String(children).replace(/\n$/, '');
            if (!match) {
              return <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>;
            }
            return (
              <div className="relative my-3 bg-gray-900 dark:bg-[#0d0d0d] rounded-xl overflow-hidden text-sm">
                <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700/50">
                  <span className="text-xs text-gray-400 font-mono">{match[1]}</span>
                  <CopyButton text={text} />
                </div>
                <pre className="overflow-x-auto p-4 m-0"><code className={`${className} font-mono text-gray-100`}>{children}</code></pre>
              </div>
            );
          },
          ...options,
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}
