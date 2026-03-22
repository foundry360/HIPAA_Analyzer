import { useState, useCallback } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import type { AnalysisType, AnalyzeResponse } from '../types';

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 150; // ~5 min (matches Lambda max)

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postAnalyzeAndPoll(
  token: string,
  apiBase: string,
  body: {
    documentId: string;
    s3Key: string;
    analysisType: AnalysisType;
    forceReanalyze?: boolean;
  }
): Promise<AnalyzeResponse> {
  const analyzeResponse = await fetch(`${apiBase}/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  if (!analyzeResponse.ok) {
    const errData = await analyzeResponse.json().catch(() => ({}));
    throw new Error((errData as { error?: string }).error ?? 'Analysis failed');
  }

  // Never trust an immediate 200 when forcing re-analysis — some API paths can still return cached COMPLETE.
  if (analyzeResponse.status === 200 && !body.forceReanalyze) {
    const resBody = (await analyzeResponse.json()) as AnalyzeResponse;
    if (resBody.status === 'COMPLETE' || (resBody.summary && resBody.status !== 'PENDING')) {
      return resBody;
    }
  } else if (analyzeResponse.status === 200 && body.forceReanalyze) {
    await analyzeResponse.json().catch(() => undefined);
  } else if (analyzeResponse.status !== 200) {
    await analyzeResponse.json().catch(() => undefined);
  }

  const pollDocId = body.documentId;
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);
    const pollRes = await fetch(`${apiBase}/result/${pollDocId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!pollRes.ok) {
      const t = await pollRes.text();
      throw new Error(t || 'Failed to get analysis status');
    }
    const polled = (await pollRes.json()) as AnalyzeResponse;
    if (polled.status === 'FAILED') {
      throw new Error(polled.error ?? 'Analysis failed');
    }
    if (polled.status === 'COMPLETE' || (!polled.status && polled.summary)) {
      return polled;
    }
  }
  throw new Error(
    'Analysis is taking longer than expected. Refresh later or try a smaller document.'
  );
}

export function useDocumentUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
  const [activeS3Key, setActiveS3Key] = useState<string | null>(null);

  const upload = useCallback(async (file: File, analysisType: AnalysisType) => {
    setError(null);
    setResult(null);

    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      if (!token) throw new Error('Not authenticated');

      const apiBase = import.meta.env.VITE_API_BASE_URL;
      if (!apiBase) throw new Error('API URL not configured');

      setIsUploading(true);
      const urlResponse = await fetch(`${apiBase}/upload-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          analysisType
        })
      });

      if (!urlResponse.ok) {
        const errBody = await urlResponse.text();
        throw new Error(errBody ? JSON.parse(errBody).error ?? errBody : 'Failed to get upload URL');
      }
      const { uploadUrl, documentId, s3Key } = (await urlResponse.json()) as {
        uploadUrl: string;
        documentId: string;
        s3Key: string;
      };

      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type }
      });

      if (!uploadResponse.ok) throw new Error('Failed to upload document');
      setActiveDocumentId(documentId);
      setActiveS3Key(s3Key);
      setIsUploading(false);

      setIsAnalyzing(true);
      const final = await postAnalyzeAndPoll(token, apiBase, {
        documentId,
        s3Key,
        analysisType
      });
      setResult(final);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred. Please try again.');
    } finally {
      setIsUploading(false);
      setIsAnalyzing(false);
    }
  }, []);

  const reanalyze = useCallback(async (analysisType: AnalysisType) => {
    setError(null);
    setResult(null);

    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      if (!token) throw new Error('Not authenticated');

      const apiBase = import.meta.env.VITE_API_BASE_URL;
      if (!apiBase) throw new Error('API URL not configured');

      if (!activeDocumentId || !activeS3Key) {
        throw new Error('No document loaded. Upload a file first.');
      }

      setIsAnalyzing(true);
      const final = await postAnalyzeAndPoll(token, apiBase, {
        documentId: activeDocumentId,
        s3Key: activeS3Key,
        analysisType,
        forceReanalyze: true
      });
      setResult(final);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred. Please try again.');
    } finally {
      setIsAnalyzing(false);
    }
  }, [activeDocumentId, activeS3Key]);

  /** Load a completed analysis from Summaries (split view). S3 key is unknown — re-run analysis is disabled until a new upload. */
  const applySavedSummary = useCallback((data: AnalyzeResponse) => {
    setError(null);
    setResult(data);
    setActiveDocumentId(data.documentId);
    setActiveS3Key(null);
  }, []);

  return { upload, reanalyze, isUploading, isAnalyzing, result, error, applySavedSummary };
}
