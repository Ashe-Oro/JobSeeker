import { ScraperAdapter, RawJob } from './types';
import { EXCLUDED_TITLE_PATTERNS, isLocationUSOrRemote } from './filters';

const BASE_URL = 'https://middleware.jobstash.xyz/public/jobs/list';
const PAGE_LIMIT = 20;
const MAX_PAGES = 100;
const DELAY_MS = 500;

// Classifications filtered to Business Development and Product Management roles
const TARGET_CLASSIFICATIONS = [
  'product',
  'product_management',
  'bizdev',
  'partnerships',
  'growth',
  'devrel',
  'management',
];

// Seniority 1 = intern/junior. Exclude these.
const MIN_SENIORITY = 2;

interface JobStashJob {
  shortUUID?: string;
  id?: string;
  title: string;
  url?: string;
  organization?: {
    name?: string;
    logoUrl?: string;
  };
  summary?: string;
  description?: string;
  location?: string;
  locationType?: string;
  seniority?: string;
  classification?: string;
  minimumSalary?: number;
  maximumSalary?: number;
  tags?: { name: string }[];
  chains?: string[];
  timestamp?: number;
  paysInCrypto?: boolean;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isLocationValid(job: JobStashJob): boolean {
  return isLocationUSOrRemote(job.location, job.locationType);
}

export class JobStashAdapter implements ScraperAdapter {
  name = 'jobstash';

  async scrape(): Promise<RawJob[]> {
    const allJobs: RawJob[] = [];
    let skippedSeniority = 0;
    let skippedTitle = 0;
    let skippedLocation = 0;

    for (let page = 1; page <= MAX_PAGES; page++) {
      console.log(`[JobStash] Fetching page ${page}...`);

      const classifications = TARGET_CLASSIFICATIONS.join(',');
      const url = `${BASE_URL}?page=${page}&limit=${PAGE_LIMIT}&classifications=${classifications}`;
      const response = await fetch(url);

      if (!response.ok) {
        console.error(`[JobStash] HTTP ${response.status} on page ${page}`);
        break;
      }

      const data = await response.json() as { data?: JobStashJob[] } | JobStashJob[];
      const jobs = Array.isArray(data) ? data : (data.data ?? []);

      if (jobs.length === 0) {
        console.log(`[JobStash] No more jobs on page ${page}, done.`);
        break;
      }

      for (const job of jobs) {
        // Filter: skip junior/intern by seniority level
        const seniority = job.seniority ? parseInt(job.seniority, 10) : null;
        if (seniority != null && seniority < MIN_SENIORITY) {
          skippedSeniority++;
          continue;
        }

        // Filter: skip junior/intern by title
        if (EXCLUDED_TITLE_PATTERNS.test(job.title)) {
          skippedTitle++;
          continue;
        }

        // Filter: must be remote or US-based
        if (!isLocationValid(job)) {
          skippedLocation++;
          continue;
        }

        const sourceId = job.shortUUID || job.id || `${job.title}-${job.organization?.name}`;
        allJobs.push({
          sourceId: String(sourceId),
          url: job.url,
          title: job.title,
          company: job.organization?.name,
          description: job.summary || job.description,
          location: job.location,
          locationType: job.locationType,
          seniority: job.seniority,
          category: job.classification,
          salaryMin: job.minimumSalary,
          salaryMax: job.maximumSalary,
          tags: job.tags?.map(t => t.name) ?? [],
          chains: job.chains ?? [],
          postedAt: job.timestamp ? new Date(job.timestamp).toISOString() : undefined,
          rawData: job as unknown as Record<string, unknown>,
        });
      }

      console.log(`[JobStash] Page ${page}: ${jobs.length} fetched, ${allJobs.length} kept`);

      if (jobs.length < PAGE_LIMIT) break;
      await delay(DELAY_MS);
    }

    console.log(`[JobStash] Scrape complete. ${allJobs.length} jobs kept (skipped: ${skippedSeniority} junior/intern, ${skippedTitle} by title, ${skippedLocation} non-US/non-remote)`);
    return allJobs;
  }
}
