/**
 * Sanitize comment body text to fix malformed links.
 *
 * Agents sometimes emit literal escape sequences (e.g. `\n`, `\r`, `\t`)
 * instead of actual whitespace characters.  When a URL is followed by `\n`
 * without a real line break the markdown renderer treats the URL + trailing
 * text as a single link, producing unclickable garbage like:
 *
 *   [https://…/pull/46\n\n**Root](https://…/pull/46%5Cn%5Cn**Root)
 *
 * This function converts the most common literal escape sequences to their
 * real character equivalents so that markdown parsers see proper whitespace
 * boundaries around URLs.
 */
export function sanitizeCommentBody(body: string): string {
  // Replace literal two-char sequences \n, \r, \t with real characters.
  // Only match the *escaped* form (backslash followed by letter), not
  // sequences that are already real whitespace.
  return body
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t");
}
