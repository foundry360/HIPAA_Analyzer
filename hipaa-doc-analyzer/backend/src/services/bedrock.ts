import {
  BedrockRuntimeClient,
  InvokeModelCommand
} from '@aws-sdk/client-bedrock-runtime';
import { AnalysisType } from '../types';

const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION });

const ANALYSIS_PROMPTS: Record<AnalysisType, string> = {
  GENERAL_SUMMARY: `Produce a comprehensive clinical summary. Cover chief complaint, key findings, diagnoses, medications, follow-up, and urgent findings as needed—each as its own ## section with narrative prose underneath (see global FORMAT rules).`,

  MEDICATIONS: `Produce a medication-focused summary: each distinct topic gets its own ## heading and narrative paragraph(s) per FORMAT rules.`,

  DIAGNOSES: `Produce a diagnosis-focused summary: each distinct topic gets its own ## heading and narrative prose per FORMAT rules.`,

  FOLLOW_UP_ACTIONS: `Produce a follow-up and care-plan summary: each distinct topic gets its own ## heading and narrative prose per FORMAT rules.`,

  CHIEF_COMPLAINT: `Produce a chief-complaint–focused summary: each distinct topic gets its own ## heading and narrative prose per FORMAT rules.`
};

export async function generateClinicalSummary(
  redactedText: string,
  analysisType: AnalysisType
): Promise<string> {
  const analysisInstructions = ANALYSIS_PROMPTS[analysisType];

  const prompt = `You are a clinical documentation specialist analyzing a de-identified medical document.

CLINICAL RULES:
- The source has been de-identified; identifiers appear as tokens like [NAME_1], [DATE_1], [ID_1]
- Refer to the patient only as "the patient" — never reconstruct identifiers
- Focus on clinical content only; be concise and use appropriate terminology
- If something is not in the document, write that it was not documented
- Do not infer beyond what the document states

FORMAT (NARRATIVE REPORT — FOLLOW EXACTLY):
- Do not use an H1 title; start directly with ## (H2) sections.
- Use ## (H2) for each section. You may number sections in the heading text: "## 1. Chief complaint", "## 2. Key findings" — always one space after the period before the section title. Under each ## write ordinary paragraphs: full sentences like a typed clinical note, not an outline.
- Prefer one paragraph per ##; add a second paragraph under the same ## only if absolutely necessary for clarity.
- ### is discouraged; do not place ### directly under H1.

FORBIDDEN IN THE BODY (under any ##): bullet lists (-, *, •), markdown list blocks (multiple lines starting with - or * or with "1." "2." as list items), or pseudo-outlines. Do not use markdown list syntax for body content. If you need to enumerate items in prose, use sentences. Section numbering belongs only in ## / ### heading text (e.g. "## 1. Title"), not as a separate numbered list.
- Use **bold** sparingly (e.g. a drug name or critical value). No HTML tags. No fenced code blocks unless quoting exact text from the document.

ANALYSIS REQUESTED:
${analysisInstructions}

DOCUMENT:
${redactedText}

Write the clinical summary now. It must read as continuous narrative paragraphs under ## headings, with zero list markers or outline formatting.`;

  const requestBody = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: parseInt(process.env.BEDROCK_MAX_TOKENS || '1500'),
    /** >0 so repeat runs on the same document are not bit-for-bit identical (still clinically grounded). */
    temperature: parseFloat(process.env.BEDROCK_TEMPERATURE || '0.5'),
    messages: [{ role: 'user', content: prompt }]
  };

  const command = new InvokeModelCommand({
    modelId: process.env.BEDROCK_MODEL_ID ||
      'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(requestBody)
  });

  const response = await client.send(command);
  const responseBody = JSON.parse(
    Buffer.from(response.body).toString('utf8')
  );

  if (!responseBody.content?.[0]?.text) {
    throw new Error('Bedrock returned empty response');
  }

  return responseBody.content[0].text;
}
