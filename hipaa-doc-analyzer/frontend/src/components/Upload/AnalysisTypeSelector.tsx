import {
  Calendar,
  ClipboardCheck,
  FileText,
  MessageCircle,
  Pill,
  type LucideIcon
} from 'lucide-react';
import type { AnalysisType } from '../../types';

const LABELS: Record<AnalysisType, string> = {
  GENERAL_SUMMARY: 'General summary',
  MEDICATIONS: 'Medications',
  DIAGNOSES: 'Diagnoses',
  FOLLOW_UP_ACTIONS: 'Follow-up',
  CHIEF_COMPLAINT: 'Chief complaint'
};

/** Short labels for tables and Summaries */
export const ANALYSIS_TYPE_LABELS: Record<AnalysisType, string> = LABELS;

const DESCRIPTIONS: Record<AnalysisType, string> = {
  GENERAL_SUMMARY: 'Broad clinical overview of the document',
  MEDICATIONS: 'Drug names, doses, changes, allergies',
  DIAGNOSES: 'Conditions, differentials, relevant tests',
  FOLLOW_UP_ACTIONS: 'Appointments, referrals, instructions',
  CHIEF_COMPLAINT: 'Reason for visit and presenting symptoms'
};

const TYPES: AnalysisType[] = [
  'GENERAL_SUMMARY',
  'MEDICATIONS',
  'DIAGNOSES',
  'FOLLOW_UP_ACTIONS',
  'CHIEF_COMPLAINT'
];

const ICONS: Record<AnalysisType, LucideIcon> = {
  GENERAL_SUMMARY: FileText,
  MEDICATIONS: Pill,
  DIAGNOSES: ClipboardCheck,
  FOLLOW_UP_ACTIONS: Calendar,
  CHIEF_COMPLAINT: MessageCircle
};

export function AnalysisTypeSelector({
  value,
  onChange
}: {
  value: AnalysisType;
  onChange: (v: AnalysisType) => void;
}) {
  return (
    <div className="w-full">
      <p className="mb-3 text-center text-xs font-medium uppercase tracking-wide text-slate-400">Analysis type</p>
      <div
        className="flex flex-wrap items-center justify-center gap-3"
        role="radiogroup"
        aria-label="Analysis type"
      >
        {TYPES.map((t) => {
          const selected = value === t;
          const label = LABELS[t];
          const desc = DESCRIPTIONS[t];
          const Icon = ICONS[t];
          return (
            <div key={t} className="group relative flex flex-col items-center">
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                aria-describedby={`analysis-tip-${t}`}
                aria-label={label}
                title={label}
                onClick={() => onChange(t)}
                className={[
                  'flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                  'bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2',
                  selected
                    ? 'border-blue-400 text-blue-600 shadow-sm'
                    : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                ].join(' ')}
              >
                <Icon className="h-6 w-6 shrink-0" strokeWidth={1.75} aria-hidden />
              </button>
              <span id={`analysis-tip-${t}`} className="sr-only">
                {desc}
              </span>
              <div
                role="tooltip"
                className="pointer-events-none absolute bottom-[calc(100%+0.35rem)] left-1/2 z-50 w-max max-w-[min(16rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-left text-xs text-white opacity-0 shadow-lg shadow-black/25 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
              >
                <span className="block font-semibold leading-tight">{label}</span>
                <span className="mt-0.5 block text-[11px] font-normal leading-snug text-slate-300">{desc}</span>
                <span
                  className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-slate-900"
                  aria-hidden
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-center text-xs text-slate-500">{LABELS[value]}</p>
    </div>
  );
}
