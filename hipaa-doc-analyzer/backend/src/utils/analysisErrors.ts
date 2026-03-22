/**
 * Maps pipeline/infra errors to a short message safe to persist and show the user (no PHI).
 */
export function userFacingAnalysisError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  const m = msg.trim();
  const lower = m.toLowerCase();

  if (m.startsWith('Could not extract text from the document')) return m;
  if (m.startsWith('No extractable text from this document')) return m;
  if (m === 'Bedrock returned empty response') {
    return 'The model did not return a summary. Please try again or use a different document.';
  }

  if (
    lower.includes('too many tokens') ||
    lower.includes('maximum context length') ||
    lower.includes('exceeds the limit') ||
    (lower.includes('validationexception') &&
      (lower.includes('token') || lower.includes('length') || lower.includes('context'))) ||
    (lower.includes('input') && lower.includes('invalid') && lower.includes('length'))
  ) {
    return 'This document is too long for one analysis. Try a shorter file, fewer pages, or split the document.';
  }

  if (lower.includes('throttl') || lower.includes('rate exceed') || lower.includes('too many requests')) {
    return 'The service is busy. Please wait a minute and try again.';
  }

  if (
    lower.includes('accessdenied') ||
    lower.includes('not authorized to perform') ||
    lower.includes('is not authorized to invoke')
  ) {
    return 'Analysis service is not available. Please contact support.';
  }

  if (
    (lower.includes('model') && (lower.includes('not found') || lower.includes('invalid'))) ||
    lower.includes('validationexception') && lower.includes('model')
  ) {
    return 'Analysis service configuration error. Please contact support.';
  }

  if (lower.includes('column') && lower.includes('does not exist')) {
    return 'The database schema is out of date (missing a required column). An administrator should run the RunDbSetup Lambda again or apply the latest SQL migration.';
  }

  return 'Analysis failed. Please try again or use a smaller document.';
}
