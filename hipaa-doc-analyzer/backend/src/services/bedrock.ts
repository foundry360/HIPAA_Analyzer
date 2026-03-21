import {
  BedrockRuntimeClient,
  InvokeModelCommand
} from '@aws-sdk/client-bedrock-runtime';
import { AnalysisType } from '../types';

const client = new BedrockRuntimeClient({ region: process.env.AWS_REGION });

const ANALYSIS_PROMPTS: Record<AnalysisType, string> = {
  GENERAL_SUMMARY: `Provide a comprehensive clinical summary including:
1. Chief complaint
2. Key clinical findings
3. Diagnoses or conditions mentioned
4. Current medications referenced
5. Recommended follow-up actions
6. Any critical values or urgent findings`,

  MEDICATIONS: `Extract and summarize all medication information including:
1. Current medications with dosages
2. Medication changes or discontinuations
3. New prescriptions
4. Allergies or adverse reactions noted
5. Medication compliance notes`,

  DIAGNOSES: `Extract and summarize all diagnostic information including:
1. Primary diagnosis
2. Secondary diagnoses or comorbidities
3. Differential diagnoses under consideration
4. Diagnostic test results referenced
5. ICD codes if mentioned`,

  FOLLOW_UP_ACTIONS: `Extract all follow-up actions and care plan items including:
1. Follow-up appointments required
2. Tests or procedures ordered
3. Referrals made
4. Patient education instructions
5. Return precautions`,

  CHIEF_COMPLAINT: `Summarize the chief complaint and presenting symptoms including:
1. Primary reason for visit
2. Symptom onset, duration, and severity
3. Associated symptoms
4. Relevant history related to chief complaint
5. Vital signs if documented`
};

export async function generateClinicalSummary(
  redactedText: string,
  analysisType: AnalysisType
): Promise<string> {
  const analysisInstructions = ANALYSIS_PROMPTS[analysisType];

  const prompt = `You are a clinical documentation specialist analyzing a de-identified medical document.

IMPORTANT INSTRUCTIONS:
- This document has been de-identified. All patient identifiers have been replaced with tokens like [NAME_1], [DATE_1], [ID_1]
- Refer to the patient only as "the patient" — never attempt to reconstruct identifiers
- Focus exclusively on clinical content
- Be concise, accurate, and use clinical terminology
- If information is not present in the document, state "Not documented"
- Do not infer or assume information not explicitly stated

ANALYSIS REQUESTED:
${analysisInstructions}

DOCUMENT:
${redactedText}

Provide your structured clinical analysis:`;

  const requestBody = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: parseInt(process.env.BEDROCK_MAX_TOKENS || '1500'),
    messages: [
      { role: 'user', content: prompt }
    ]
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
