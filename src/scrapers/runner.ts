import { ScraperAdapter } from './types';
import { JobStashAdapter } from './jobstash';
import { SafaryAdapter } from './safary';
import { Web3CareerAdapter } from './web3career';
import { CryptoJobsListAdapter } from './cryptojobslist';
import { upsertJob, startScrapeRun, completeScrapeRun } from '../db';

const adapters: Record<string, () => ScraperAdapter> = {
  jobstash: () => new JobStashAdapter(),
  safary: () => new SafaryAdapter(),
  web3career: () => new Web3CareerAdapter(),
  cryptojobslist: () => new CryptoJobsListAdapter(),
};

export async function runScraper(source: string): Promise<{ jobsFound: number; jobsNew: number }> {
  const factory = adapters[source];
  if (!factory) {
    throw new Error(`Unknown source: ${source}. Available: ${Object.keys(adapters).join(', ')}`);
  }

  const adapter = factory();
  const runId = startScrapeRun(source);

  try {
    console.log(`[Runner] Starting scrape for ${source}...`);
    const rawJobs = await adapter.scrape();

    let jobsNew = 0;
    for (const raw of rawJobs) {
      const result = upsertJob({ source, ...raw });
      if (result.isNew) jobsNew++;
    }

    completeScrapeRun(runId, 'completed', rawJobs.length, jobsNew);
    console.log(`[Runner] ${source} complete: ${rawJobs.length} found, ${jobsNew} new`);
    return { jobsFound: rawJobs.length, jobsNew };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    completeScrapeRun(runId, 'failed', 0, 0, message);
    console.error(`[Runner] ${source} failed:`, message);
    throw error;
  }
}

export async function runAllScrapers(): Promise<Record<string, { jobsFound: number; jobsNew: number }>> {
  const results: Record<string, { jobsFound: number; jobsNew: number }> = {};

  for (const source of Object.keys(adapters)) {
    try {
      results[source] = await runScraper(source);
    } catch (error) {
      console.error(`[Runner] Skipping ${source} due to error`);
      results[source] = { jobsFound: 0, jobsNew: 0 };
    }
  }

  return results;
}
