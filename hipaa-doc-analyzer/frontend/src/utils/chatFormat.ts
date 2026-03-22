/**
 * Strip common markdown so chat reads as plain prose; model is also instructed not to use markdown.
 */
export function stripChatMarkdown(text: string): string {
  let t = text.trim();
  t = t.replace(/\*\*([^*]+)\*\*/g, '$1');
  t = t.replace(/__([^_]+)__/g, '$1');
  t = t.replace(/`([^`]+)`/g, '$1');
  t = t.replace(/^#{1,6}\s+/gm, '');
  t = t.replace(/^\s*[-*+]\s+/gm, '');
  return t;
}

/** Split into paragraph blocks (blank line) for display. */
export function assistantTextToParagraphs(text: string): string[] {
  const cleaned = stripChatMarkdown(text);
  if (!cleaned) return [];
  const parts = cleaned
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [cleaned];
}
