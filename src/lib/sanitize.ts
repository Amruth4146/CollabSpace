/**
 * Server-side HTML sanitization for rich text document content.
 * Prevents XSS, unsafe protocols (javascript:, data:, vbscript:),
 * script tags, and malicious event handlers while preserving safe TipTap elements.
 */

export function sanitizeHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';

  let sanitized = html;

  // 1. Remove script tags and their content
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // 2. Remove style tags and their content
  sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // 3. Remove dangerous HTML elements (iframes, objects, embeds, forms, meta, base)
  sanitized = sanitized.replace(/<\/?(iframe|object|embed|applet|form|meta|base|link)\b[^>]*>/gi, '');

  // 4. Strip all event handlers (e.g. onclick, onerror, onload, onmouseover)
  sanitized = sanitized.replace(/\s+on[a-zA-Z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  // 5. Neutralize dangerous pseudo-protocols in href and src attributes (javascript:, vbscript:, data:)
  sanitized = sanitized.replace(
    /\s+(href|src)\s*=\s*("(?:\s*javascript:|\s*vbscript:|\s*data:)[^"]*"|'(?:\s*javascript:|\s*vbscript:|\s*data:)[^']*')/gi,
    ' $1="#"'
  );

  return sanitized;
}

export function isValidProtocol(url: string): boolean {
  if (!url) return false;
  const trimmed = url.trim().toLowerCase();
  if (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('vbscript:') ||
    trimmed.startsWith('data:')
  ) {
    return false;
  }
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('#')
  );
}
