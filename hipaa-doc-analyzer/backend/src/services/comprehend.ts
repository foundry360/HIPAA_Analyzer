import {
  ComprehendMedicalClient,
  DetectPHICommand
} from '@aws-sdk/client-comprehendmedical';
import { PHIEntity, TokenMap } from '../types';

const client = new ComprehendMedicalClient({ region: process.env.AWS_REGION });

const CONFIDENCE_THRESHOLD = 0.85;
const MAX_TEXT_LENGTH = 20000; // Comprehend Medical limit per call

export async function detectAndRedactPHI(rawText: string): Promise<{
  redactedText: string;
  tokenMap: TokenMap;
  entities: PHIEntity[];
}> {
  // Handle texts longer than the API limit by chunking
  const chunks = chunkText(rawText, MAX_TEXT_LENGTH);
  let allEntities: PHIEntity[] = [];
  let offset = 0;

  for (const chunk of chunks) {
    const chunkEntities = await detectPHIInChunk(chunk);
    // Adjust offsets for position in full text
    const adjustedEntities = chunkEntities.map(e => ({
      ...e,
      beginOffset: e.beginOffset + offset,
      endOffset: e.endOffset + offset
    }));
    allEntities = [...allEntities, ...adjustedEntities];
    offset += chunk.length;
  }

  // Filter to high-confidence detections only
  const highConfidence = allEntities.filter(
    e => e.score >= CONFIDENCE_THRESHOLD
  );

  // Sort by position descending so replacements don't shift offsets
  const sorted = [...highConfidence].sort(
    (a, b) => b.beginOffset - a.beginOffset
  );

  let redactedText = rawText;
  const tokenMap: TokenMap = {};
  let tokenCounter = 1;

  for (const entity of sorted) {
    const token = `[${entity.type}_${tokenCounter}]`;
    tokenMap[token] = {
      originalValue: entity.text,
      type: entity.type,
      confidence: entity.score
    };
    redactedText =
      redactedText.substring(0, entity.beginOffset) +
      token +
      redactedText.substring(entity.endOffset);
    tokenCounter++;
  }

  return { redactedText, tokenMap, entities: highConfidence };
}

async function detectPHIInChunk(text: string): Promise<PHIEntity[]> {
  const command = new DetectPHICommand({ Text: text });
  const response = await client.send(command);

  return (response.Entities || []).map(e => ({
    text: e.Text || '',
    type: e.Type || 'UNKNOWN',
    beginOffset: e.BeginOffset || 0,
    endOffset: e.EndOffset || 0,
    score: e.Score || 0
  }));
}

function chunkText(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    // Try to break at a newline near the limit
    let end = start + maxLength;
    if (end < text.length) {
      const lastNewline = text.lastIndexOf('\n', end);
      if (lastNewline > start) end = lastNewline;
    }
    chunks.push(text.substring(start, end));
    start = end;
  }
  return chunks;
}
