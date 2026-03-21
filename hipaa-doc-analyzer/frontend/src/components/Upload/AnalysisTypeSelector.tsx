import type { AnalysisType } from '../../types';

const LABELS: Record<AnalysisType, string> = {
  GENERAL_SUMMARY: 'General summary',
  MEDICATIONS: 'Medications',
  DIAGNOSES: 'Diagnoses',
  FOLLOW_UP_ACTIONS: 'Follow-up actions',
  CHIEF_COMPLAINT: 'Chief complaint'
};

const TYPES: AnalysisType[] = [
  'GENERAL_SUMMARY',
  'MEDICATIONS',
  'DIAGNOSES',
  'FOLLOW_UP_ACTIONS',
  'CHIEF_COMPLAINT'
];

export function AnalysisTypeSelector({
  value,
  onChange
}: {
  value: AnalysisType;
  onChange: (v: AnalysisType) => void;
}) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-slate-700 mb-2">Analysis type</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as AnalysisType)}
        className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
      >
        {TYPES.map((t) => (
          <option key={t} value={t}>
            {LABELS[t]}
          </option>
        ))}
      </select>
    </div>
  );
}
