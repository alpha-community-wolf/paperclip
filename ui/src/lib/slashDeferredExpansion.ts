/** Snapshot for a slash command picked during compose; template expands at submit only. */
export interface SlashDeferredPayload {
  /** Markdown/value before the `/query` token (insert expansion immediately after this prefix). */
  before: string;
  /** Full template to inject (same spacing rules as immediate insert: usually trailing space). */
  expansion: string;
}

/** Merge deferred slash template into the current field value for API submit. */
export function mergeSlashExpansionForSubmit(markdown: string, payload: SlashDeferredPayload): string {
  const { before, expansion } = payload;
  if (!before) {
    const t = markdown.trimEnd();
    const e = expansion.trimEnd();
    if (!e) return markdown;
    if (!t) return expansion;
    return `${t}\n\n${e}`;
  }
  const off = before.length;
  if (markdown.startsWith(before)) {
    return markdown.slice(0, off) + expansion + markdown.slice(off);
  }
  const t = markdown.trimEnd();
  const e = expansion.trimEnd();
  if (!e) return markdown;
  if (!t) return expansion;
  return `${t}\n\n${e}`;
}
