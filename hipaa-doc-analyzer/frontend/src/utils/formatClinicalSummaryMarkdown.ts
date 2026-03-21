/**
 * Insert a space after ":" when it sits between a word-like character and a letter
 * (e.g. "Note:Patient" → "Note: Patient"). Skips times like 12:30 and URLs.
 */
function fixColonSpacing(text: string): string {
  let prev = '';
  let cur = text;
  while (cur !== prev) {
    prev = cur;
    cur = cur.replace(/([a-zA-Z0-9)]):([a-zA-Z])/g, '$1: $2');
  }
  return cur;
}

/**
 * Normalizes model output for display:
 * - All # / ## / ### heading lines become fully bold: ## **1. Title** or ## **Chief complaint**
 * - Standalone "1. Label" lines become **1. Label** with a blank line before body
 * - Colons get a space before the following word where appropriate
 */
/** Remove redundant "Clinical summary" H1/H2/H3 that the model may still output */
function stripClinicalSummaryHeading(lines: string[]): string[] {
  return lines.filter(
    (line) => !/^#{1,3}\s*Clinical\s+[Ss]ummary\s*$/.test(line.trim())
  );
}

export function formatClinicalSummaryMarkdown(text: string): string {
  const lines = stripClinicalSummaryHeading(text.split('\n'));
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trimStart();
    const indent = line.slice(0, line.length - trimmed.length);

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading && heading[1] && heading[2] !== undefined) {
      const hashes = heading[1];
      let rest = heading[2].trimEnd();

      // Legacy: ## **1.** Rest → ## **1. Rest**
      const partialNum = rest.match(/^\*\*(\d+)\.\*\*\s+(.+)$/);
      if (partialNum) {
        rest = `**${partialNum[1]}. ${partialNum[2]}**`;
        out.push(`${indent}${hashes} ${rest}`);
        continue;
      }

      // ## 1. Title → ## **1. Title**
      const numbered = rest.match(/^(\d+)\.\s+(.+)$/);
      if (numbered) {
        rest = `**${numbered[1]}. ${numbered[2]}**`;
        out.push(`${indent}${hashes} ${rest}`);
        continue;
      }

      // Already fully wrapped: ## **Title**
      if (/^\*\*.+\*\*$/.test(rest.trim())) {
        out.push(`${indent}${hashes} ${rest}`);
        continue;
      }

      // ## Plain title → ## **Plain title**
      rest = `**${rest}**`;
      out.push(`${indent}${hashes} ${rest}`);
      continue;
    }

    // Standalone numbered line (section label, not a # heading)
    if (/^\d+\.\s+/.test(trimmed) && !trimmed.startsWith('**')) {
      const plain = trimmed.match(/^(\d+)\.\s+(.+)$/);
      if (plain) {
        const [, num, rest] = plain;
        out.push(`${indent}**${num}. ${rest}**`);
        const next = lines[i + 1];
        if (
          next !== undefined &&
          next.trim() !== '' &&
          !/^(#{1,3}\s|\d+\.\s|[*-]\s)/.test(next.trim())
        ) {
          out.push('');
        }
        continue;
      }
    }

    out.push(line);
  }

  return fixColonSpacing(out.join('\n'));
}
