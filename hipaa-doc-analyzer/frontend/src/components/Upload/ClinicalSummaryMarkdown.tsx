import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { formatClinicalSummaryMarkdown } from '../../utils/formatClinicalSummaryMarkdown';

type Props = {
  /** Raw summary text from the API (often Markdown from the model). */
  children: string;
};

/**
 * Intended structure (Markdown → HTML):
 * - #  → H1: one document title
 * - ## → H2: section titles
 * - ### → H3: optional sub-headings
 * - <p> body copy under headings
 *
 * Spacing is explicit: typography `prose-p:mt-0` was collapsing gaps after headings.
 */
export function ClinicalSummaryMarkdown({ children }: Props) {
  const source = formatClinicalSummaryMarkdown(children);

  return (
    <div
      className={[
        'clinical-summary break-words text-sm leading-[1.65] text-slate-700',
        'prose prose-sm max-w-none prose-slate',
        'prose-headings:scroll-mt-4 prose-headings:font-bold prose-headings:tracking-tight',
        /* Title */
        'prose-h1:mb-5 prose-h1:mt-0 prose-h1:text-lg prose-h1:font-bold prose-h1:text-slate-900',
        /* H2 — space below title (heading → body: also in index.css for consistency) */
        '[&_h2:first-child]:mt-0 [&_h1+h2]:mt-10',
        '[&_h2:not(:first-of-type)]:mt-10 [&_h2:not(:first-of-type)]:border-t [&_h2:not(:first-of-type)]:border-slate-200 [&_h2:not(:first-of-type)]:pt-8',
        'prose-h2:mb-5 prose-h2:mt-0 prose-h2:border-b prose-h2:border-slate-200 prose-h2:pb-2 prose-h2:text-base prose-h2:font-bold prose-h2:text-slate-900',
        /* H3 */
        'prose-h3:mb-4 prose-h3:mt-8 prose-h3:text-[0.9375rem] prose-h3:font-bold prose-h3:text-slate-900',
        /* Paragraphs: vertical rhythm; extra gap before a new p via index.css (p + p) */
        'prose-p:mb-4 prose-p:leading-relaxed prose-p:first:mt-0',
        '[&_p:last-child]:mb-0',
        'prose-ul:my-4 prose-ol:my-4 prose-li:my-1.5 prose-li:marker:text-slate-400',
        'prose-strong:font-bold prose-strong:text-slate-900',
        /* Numbered ordered lists: bold list markers to match "1." heading style */
        '[&_ol>li]:marker:font-bold [&_ol>li]:marker:text-slate-900',
        '[&_h1>strong]:text-slate-900 [&_h2>strong]:text-slate-900 [&_h3>strong]:text-slate-900'
      ].join(' ')}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  );
}
