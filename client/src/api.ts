const BASE = '/api';

export interface Job {
  id: string;
  source: string;
  sourceId: string;
  url: string | null;
  title: string;
  company: string | null;
  description: string | null;
  location: string | null;
  locationType: string | null;
  seniority: string | null;
  category: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  tags: string;
  chains: string;
  postedAt: string | null;
  scrapedAt: string;
  overallScore: number | null;
  relevanceScore: number | null;
  experienceMatch: number | null;
  domainMatch: number | null;
  seniorityFit: number | null;
  reasoning: string | null;
  actions: string | null;
}

export interface JobDetail extends Job {
  rawData: string;
  actions: { action: string; notes: string | null; createdAt: string }[];
}

export interface Stats {
  total: number;
  scored: number;
  avgScore: number;
  bySource: Record<string, number>;
  byCategory: Record<string, number>;
  lastScrape: string | null;
}

export interface Filters {
  source?: string;
  minScore?: number;
  category?: string;
  location?: string;
  seniority?: string;
  search?: string;
  action?: string;
  excludeAction?: string;
  noAction?: boolean;
  sort?: string;
  page?: number;
  limit?: number;
}

export interface FilterOptions {
  categories: string[];
  locations: string[];
}

export async function fetchJobs(filters: Filters = {}): Promise<{ jobs: Job[]; total: number }> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v != null && v !== '') params.set(k, String(v));
  }
  const res = await fetch(`${BASE}/jobs?${params}`);
  return res.json();
}

export async function fetchFilterOptions(): Promise<FilterOptions> {
  const res = await fetch(`${BASE}/jobs/filters`);
  const data = await res.json();
  return { categories: data.categories ?? [], locations: data.locations ?? [] };
}

export async function fetchJob(id: string): Promise<{ job: JobDetail }> {
  const res = await fetch(`${BASE}/jobs/${id}`);
  return res.json();
}

export async function fetchStats(): Promise<Stats> {
  const res = await fetch(`${BASE}/jobs/stats`);
  const data = await res.json();
  return data;
}

export async function triggerScrape(source: string = 'all'): Promise<unknown> {
  const res = await fetch(`${BASE}/jobs/scrape`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source }),
  });
  return res.json();
}

export async function triggerScore(limit: number = 50): Promise<unknown> {
  const res = await fetch(`${BASE}/jobs/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit }),
  });
  return res.json();
}

export async function addJobAction(jobId: string, action: string, notes?: string): Promise<void> {
  await fetch(`${BASE}/jobs/${jobId}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, notes }),
  });
}

export async function removeJobAction(jobId: string, action?: string): Promise<void> {
  const params = action ? `?action=${action}` : '';
  await fetch(`${BASE}/jobs/${jobId}/action${params}`, { method: 'DELETE' });
}

export async function scrapeAndScore(): Promise<{ scrapeResults: Record<string, { jobsFound: number; jobsNew: number }>; scored: number }> {
  const res = await fetch(`${BASE}/jobs/scrape-and-score`, { method: 'POST' });
  return res.json();
}
