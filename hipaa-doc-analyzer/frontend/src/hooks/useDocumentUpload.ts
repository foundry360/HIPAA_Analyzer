import { useState } from 'react';
import { fetchAuthSession } from 'aws-amplify/auth';
import type { AnalysisType, AnalyzeResponse } from '../types';

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 150; // ~5 min (matches Lambda max)

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useDocumentUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File, analysisType: AnalysisType) => {
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
      setIsUploading(false);

      setIsAnalyzing(true);
      const analyzeResponse = await fetch(`${apiBase}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ documentId, s3Key, analysisType })
      });

      if (!analyzeResponse.ok) {
        const errData = await analyzeResponse.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error ?? 'Analysis failed');
      }

      // 200 = result already in DB (e.g. retry); 202 = async job started (API Gateway 29s limit)
      if (analyzeResponse.status === 200) {
        const body = (await analyzeResponse.json()) as AnalyzeResponse;
        if (body.status === 'COMPLETE' || (body.summary && body.status !== 'PENDING')) {
          setResult(body);
          return;
        }
      }

      const pollDocId = documentId;
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
        if (
          polled.status === 'COMPLETE' ||
          (!polled.status && polled.summary)
        ) {
          setResult(polled);
          return;
        }
      }
      throw new Error(
        'Analysis is taking longer than expected. Refresh later or try a smaller document.'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred. Please try again.');
    } finally {
      setIsUploading(false);
      setIsAnalyzing(false);
    }
  };

  return { upload, isUploading, isAnalyzing, result, error };
}
