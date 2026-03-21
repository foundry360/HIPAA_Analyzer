import {
  TextractClient,
  AnalyzeDocumentCommand,
  DetectDocumentTextCommand,
  GetDocumentTextDetectionCommand,
  StartDocumentTextDetectionCommand,
  FeatureType
} from '@aws-sdk/client-textract';

const client = new TextractClient({ region: process.env.AWS_REGION });

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function blocksToText(blocks: { BlockType?: string; Text?: string }[] | undefined): string {
  if (!blocks || blocks.length === 0) return '';
  const lines = blocks
    .filter(b => b.BlockType === 'LINE' && b.Text)
    .map(b => b.Text!);
  const words = blocks
    .filter(b => b.BlockType === 'WORD' && b.Text)
    .map(b => b.Text!);
  const lineText = lines.join('\n').trim();
  const wordText = words.join(' ').trim();
  return [lineText, wordText].filter(Boolean).join('\n');
}

/**
 * Multi-page PDFs: synchronous Textract only supports **single-page** PDFs.
 * Async StartDocumentTextDetection processes full PDFs (many pages).
 */
async function extractTextAsyncFromS3(bucket: string, key: string): Promise<string> {
  const start = await client.send(
    new StartDocumentTextDetectionCommand({
      DocumentLocation: { S3Object: { Bucket: bucket, Name: key } }
    })
  );
  const jobId = start.JobId;
  if (!jobId) throw new Error('Textract did not return a job id');

  const deadline = Date.now() + 240_000; // 4 min (Lambda is 5 min; leave time for Comprehend + Bedrock)

  while (Date.now() < deadline) {
    await sleep(2000);
    const first = await client.send(
      new GetDocumentTextDetectionCommand({ JobId: jobId, MaxResults: 1000 })
    );
    const status = first.JobStatus;

    if (status === 'FAILED') {
      throw new Error(first.StatusMessage ?? 'Textract async job failed');
    }
    if (status === 'IN_PROGRESS') {
      continue;
    }
    if (status === 'SUCCEEDED' || status === 'PARTIAL_SUCCESS') {
      const blocks: { BlockType?: string; Text?: string }[] = [...(first.Blocks ?? [])];
      let nextToken = first.NextToken;
      while (nextToken) {
        const more = await client.send(
          new GetDocumentTextDetectionCommand({
            JobId: jobId,
            MaxResults: 1000,
            NextToken: nextToken
          })
        );
        blocks.push(...(more.Blocks ?? []));
        nextToken = more.NextToken;
      }
      return blocksToText(blocks);
    }
  }

  throw new Error('Textract async job timed out');
}

export async function extractTextFromS3(
  bucket: string,
  key: string
): Promise<string> {
  const s3Doc = { S3Object: { Bucket: bucket, Name: key } };
  const isPdf = /\.pdf$/i.test(key);

  // Try synchronous APIs (single-page PDFs, images)
  try {
    const response = await client.send(
      new AnalyzeDocumentCommand({
        Document: s3Doc,
        FeatureTypes: [FeatureType.FORMS, FeatureType.TABLES]
      })
    );
    const text = blocksToText(response.Blocks);
    if (text) return text;
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === 'UnsupportedDocumentException' || name === 'InvalidS3ObjectException') {
      try {
        const fallback = await client.send(new DetectDocumentTextCommand({ Document: s3Doc }));
        const text = blocksToText(fallback.Blocks);
        if (text) return text;
      } catch {
        // continue
      }
      if (isPdf) {
        try {
          const asyncText = await extractTextAsyncFromS3(bucket, key);
          if (asyncText) return asyncText;
        } catch (e) {
          console.error('Textract async failed:', e);
        }
      }
      return 'No extractable text in document.';
    }
    throw err;
  }

  try {
    const fallback = await client.send(new DetectDocumentTextCommand({ Document: s3Doc }));
    const text = blocksToText(fallback.Blocks);
    if (text) return text;
  } catch {
    // Multi-page PDFs often fail here
  }

  if (isPdf) {
    try {
      const asyncText = await extractTextAsyncFromS3(bucket, key);
      if (asyncText) return asyncText;
    } catch (e) {
      console.error('Textract async failed:', e);
    }
  }

  return 'No extractable text in document.';
}
