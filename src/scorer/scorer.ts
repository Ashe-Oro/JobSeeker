import OpenAI from 'openai';
import { CANDIDATE_PROFILE } from './profile';
import { getUnscoredJobs, upsertScore } from '../db';

const MODEL = 'gpt-4o-mini';

const SYSTEM_PROMPT = `You are a strict, realistic job-matching expert. You will be given a candidate's profile and a job listing. Score how well the job REALISTICALLY matches the candidate on 4 dimensions (each 0-100):

1. relevance_score (weight: 35%) - How well does this match the candidate's target roles (PM, BD)?
2. experience_match (weight: 25%) - Does the candidate's actual work history meet what the job requires? Be honest about gaps.
3. domain_match (weight: 25%) - How much overlap with candidate's domains (AI x Web3, DeFi, NFTs, SDK, DevRel)?
4. seniority_fit (weight: 15%) - CRITICAL: Is this the right level? The candidate's highest title is Lead PM / TPM (IC lead). He has NOT been a Head of, VP, Director, or people manager. Score seniority_fit BELOW 30 for Head-of/VP/C-suite roles. Score 60-80 for senior IC roles. Score 80-100 for mid-level roles. Do NOT give founder credit for small side projects that did not reach PMF.

Calculate overall_score as the weighted average: (relevance * 0.35) + (experience * 0.25) + (domain * 0.25) + (seniority * 0.15)

Be critical. A score of 70+ should mean the candidate could realistically get an interview. A score of 50-69 means a stretch. Below 50 means unlikely to be considered.

IMPORTANT: The candidate uses he/him pronouns. Always refer to him as "he", "him", or "his" in your reasoning — never "they" or "their".

Respond ONLY with valid JSON in this exact format:
{
  "overall_score": <number>,
  "relevance_score": <number>,
  "experience_match": <number>,
  "domain_match": <number>,
  "seniority_fit": <number>,
  "reasoning": "<2-3 sentence explanation>"
}`;

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, baseDelayMs = 1000): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.log(`[Scorer] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

export async function scoreJob(
  client: OpenAI,
  job: { id: string; title: string; company: string | null; description: string | null; seniority: string | null; category: string | null; tags: string; chains: string; rawData?: string }
): Promise<void> {
  // Extract requirements and responsibilities from raw data
  let requirements: string[] = [];
  let responsibilities: string[] = [];
  let fullDescription = '';
  if (job.rawData) {
    try {
      const raw = JSON.parse(job.rawData);
      if (Array.isArray(raw.requirements)) requirements = raw.requirements;
      if (Array.isArray(raw.responsibilities)) responsibilities = raw.responsibilities;
      if (raw.description) fullDescription = raw.description;
    } catch { /* ignore parse errors */ }
  }

  const jobDescription = [
    `Title: ${job.title}`,
    job.company ? `Company: ${job.company}` : null,
    job.seniority ? `Seniority: ${job.seniority}` : null,
    job.category ? `Category: ${job.category}` : null,
    job.description ? `Summary: ${job.description}` : null,
    fullDescription ? `Full Description: ${fullDescription}` : null,
    requirements.length > 0 ? `Requirements:\n${requirements.map(r => `- ${r}`).join('\n')}` : null,
    responsibilities.length > 0 ? `Responsibilities:\n${responsibilities.map(r => `- ${r}`).join('\n')}` : null,
    `Tags: ${job.tags}`,
    `Chains: ${job.chains}`,
  ].filter(Boolean).join('\n\n');

  const result = await withRetry(async () => {
    const response = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.3,
      max_tokens: 300,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `${CANDIDATE_PROFILE}\n\n---\n\nJob Listing:\n${jobDescription}` },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) throw new Error('Empty response from LLM');

    const parsed = JSON.parse(content);
    if (typeof parsed.overall_score !== 'number') throw new Error('Invalid score format');
    return parsed;
  });

  upsertScore({
    jobId: job.id,
    overallScore: Math.round(result.overall_score),
    relevanceScore: Math.round(result.relevance_score),
    experienceMatch: Math.round(result.experience_match),
    domainMatch: Math.round(result.domain_match),
    seniorityFit: Math.round(result.seniority_fit),
    reasoning: result.reasoning,
    modelUsed: MODEL,
  });
}

export async function scoreUnscored(limit: number = 50): Promise<number> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set');
  }

  const client = new OpenAI({ apiKey });
  const jobs = getUnscoredJobs(limit);

  console.log(`[Scorer] Scoring ${jobs.length} unscored jobs...`);

  let scored = 0;
  for (const job of jobs) {
    try {
      await scoreJob(client, job);
      scored++;
      if (scored % 10 === 0) {
        console.log(`[Scorer] Progress: ${scored}/${jobs.length}`);
      }
    } catch (error) {
      console.error(`[Scorer] Failed to score job "${job.title}":`, error);
    }
  }

  console.log(`[Scorer] Done. Scored ${scored}/${jobs.length} jobs.`);
  return scored;
}
