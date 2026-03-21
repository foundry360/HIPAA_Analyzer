import DOMPurify from 'dompurify';
import { jsPDF } from 'jspdf';
import { marked } from 'marked';
import { formatClinicalSummaryMarkdown } from './formatClinicalSummaryMarkdown';

export function summaryPdfFilename(sourceFileName: string): string {
  const base = sourceFileName
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\.[^.]+$/, '')
    .trim();
  return `${base || 'summary'}_summary.pdf`;
}

type PdfBlock =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'blockquote'; text: string }
  | { kind: 'pre'; text: string }
  | { kind: 'li'; text: string }
  | { kind: 'table'; text: string }
  | { kind: 'hr' };

function collectBlockText(el: HTMLElement, tag: string): string {
  if (tag === 'PRE') {
    return (el.textContent ?? '').replace(/\r\n/g, '\n').trimEnd();
  }
  let s = '';
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      s += child.textContent ?? '';
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const c = child as HTMLElement;
      if (c.tagName === 'BR') {
        s += '\n';
      } else {
        s += collectBlockText(c, c.tagName);
      }
    }
  }
  return s.replace(/\s+/g, ' ').trim();
}

function tableToPlain(table: HTMLElement): string {
  let t = '';
  for (const tr of table.querySelectorAll('tr')) {
    const cells = Array.from(tr.querySelectorAll('td, th')).map((cell) =>
      (cell.textContent ?? '').replace(/\s+/g, ' ').trim()
    );
    const row = cells.filter(Boolean).join(' | ');
    if (row) t += `${row}\n`;
  }
  return t.trim();
}

/**
 * Walks sanitized HTML and yields ordered blocks so headings can be drawn bold in the PDF.
 */
function htmlToPdfBlocks(html: string): PdfBlock[] {
  const doc = new DOMParser().parseFromString(`<div id="pdf-export-root">${html}</div>`, 'text/html');
  const root = doc.getElementById('pdf-export-root');
  if (!root) return [];

  const blocks: PdfBlock[] = [];

  function walk(node: Node): void {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName;

    if (tag === 'DIV') {
      for (const child of el.childNodes) {
        walk(child);
      }
      return;
    }

    if (tag === 'UL' || tag === 'OL') {
      for (const li of el.querySelectorAll(':scope > li')) {
        walk(li);
      }
      return;
    }

    if (tag === 'TABLE') {
      const text = tableToPlain(el);
      if (text) blocks.push({ kind: 'table', text });
      return;
    }

    if (tag === 'HR') {
      blocks.push({ kind: 'hr' });
      return;
    }

    if (tag === 'H1' || tag === 'H2' || tag === 'H3' || tag === 'H4' || tag === 'H5' || tag === 'H6') {
      const level = Number(tag[1]) as 1 | 2 | 3 | 4 | 5 | 6;
      const text = collectBlockText(el, tag);
      if (text) blocks.push({ kind: 'heading', level, text });
      return;
    }

    if (tag === 'P') {
      const text = collectBlockText(el, tag);
      if (text) blocks.push({ kind: 'paragraph', text });
      return;
    }

    if (tag === 'BLOCKQUOTE') {
      const text = collectBlockText(el, tag);
      if (text) blocks.push({ kind: 'blockquote', text });
      return;
    }

    if (tag === 'PRE') {
      const text = collectBlockText(el, tag);
      if (text) blocks.push({ kind: 'pre', text });
      return;
    }

    if (tag === 'LI') {
      const text = collectBlockText(el, tag);
      if (text) blocks.push({ kind: 'li', text });
      return;
    }

    for (const child of el.childNodes) {
      walk(child);
    }
  }

  for (const child of root.childNodes) {
    walk(child);
  }

  return blocks;
}

function headingFontSize(level: 1 | 2 | 3 | 4 | 5 | 6): number {
  switch (level) {
    case 1:
      return 14;
    case 2:
      return 12.5;
    case 3:
      return 11.5;
    default:
      return 11;
  }
}

/** Approximate line step (mm) from font size (pt). */
function lineStepMm(fontSizePt: number): number {
  return Math.max(4.2, fontSizePt * 0.38);
}

/**
 * Renders Markdown → HTML → structured blocks and writes a multi-page PDF with bold headings.
 */
export async function downloadSummaryPdf(markdown: string, sourceFileName: string): Promise<void> {
  const body = formatClinicalSummaryMarkdown(markdown);
  const rawHtml = await marked.parse(body, { async: true, gfm: true });
  const htmlString = typeof rawHtml === 'string' ? rawHtml : String(rawHtml);
  const safe = DOMPurify.sanitize(htmlString, { USE_PROFILES: { html: true } });

  const blocks = htmlToPdfBlocks(safe);
  if (blocks.length === 0) {
    throw new Error('No text content to export');
  }

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 16;
  const maxLineWidth = pageWidth - margin * 2;
  const bodyFont = 10.5;

  const filename = summaryPdfFilename(sourceFileName);
  const title = sourceFileName.replace(/\.[^.]+$/, '') || 'Clinical summary';

  const titleLineStart = margin + 7;
  const bodyLineStart = margin + 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  const titleLines = doc.splitTextToSize(title, maxLineWidth);
  let y = titleLineStart;
  const titleStep = lineStepMm(14);

  for (const tline of titleLines) {
    if (y > pageHeight - margin) {
      doc.addPage();
      y = titleLineStart;
    }
    doc.text(tline, margin, y);
    y += titleStep;
  }

  y += 5;

  const drawLines = (lines: string[], fontSize: number, style: 'normal' | 'bold', indent = 0): void => {
    doc.setFont('helvetica', style);
    doc.setFontSize(fontSize);
    const step = lineStepMm(fontSize);
    const x = margin + indent;
    for (const line of lines) {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = bodyLineStart;
        doc.setFont('helvetica', style);
        doc.setFontSize(fontSize);
      }
      doc.text(line, x, y);
      y += step;
    }
  };

  for (const block of blocks) {
    if (block.kind === 'hr') {
      if (y > pageHeight - margin - 8) {
        doc.addPage();
        y = bodyLineStart;
      }
      y += 2;
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.line(margin, y, pageWidth - margin, y);
      y += 6;
      continue;
    }

    if (block.kind === 'heading') {
      const size = headingFontSize(block.level);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(size);
      const wrapped = doc.splitTextToSize(block.text, maxLineWidth);
      drawLines(wrapped, size, 'bold');
      y += 2;
      continue;
    }

    if (block.kind === 'paragraph') {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(bodyFont);
      const wrapped = doc.splitTextToSize(block.text, maxLineWidth);
      drawLines(wrapped, bodyFont, 'normal', 0);
      y += 2.5;
      continue;
    }

    if (block.kind === 'blockquote') {
      const indent = 4;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(bodyFont);
      const wrapped = doc.splitTextToSize(block.text, maxLineWidth - indent);
      drawLines(wrapped, bodyFont, 'normal', indent);
      y += 2.5;
      continue;
    }

    if (block.kind === 'li') {
      const prefixed = `• ${block.text}`;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(bodyFont);
      const wrapped = doc.splitTextToSize(prefixed, maxLineWidth);
      drawLines(wrapped, bodyFont, 'normal');
      y += 2;
      continue;
    }

    if (block.kind === 'pre') {
      const preSize = 9.5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(preSize);
      const parts = block.text.split('\n');
      const lines: string[] = [];
      for (const pl of parts) {
        lines.push(...doc.splitTextToSize(pl, maxLineWidth));
      }
      drawLines(lines, preSize, 'normal');
      y += 2.5;
      continue;
    }

    if (block.kind === 'table') {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(bodyFont);
      const wrapped = doc.splitTextToSize(block.text, maxLineWidth);
      drawLines(wrapped, bodyFont, 'normal');
      y += 2.5;
    }
  }

  doc.save(filename);
}
