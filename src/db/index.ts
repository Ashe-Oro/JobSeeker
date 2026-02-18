import { initializeDatabase } from './schema';
import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

let db: Database.Database;

export function getDatabase(): Database.Database {
  if (!db) {
    db = initializeDatabase();
  }
  return db;
}

// --- Jobs ---

export interface JobRow {
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
  rawData: string;
}

export interface JobWithScore extends JobRow {
  overallScore: number | null;
  relevanceScore: number | null;
  experienceMatch: number | null;
  domainMatch: number | null;
  seniorityFit: number | null;
  reasoning: string | null;
  actions: string | null;
}

export interface JobFilters {
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

export function upsertJob(job: {
  source: string;
  sourceId: string;
  url?: string;
  title: string;
  company?: string;
  description?: string;
  location?: string;
  locationType?: string;
  seniority?: string;
  category?: string;
  salaryMin?: number;
  salaryMax?: number;
  tags?: string[];
  chains?: string[];
  postedAt?: string;
  rawData?: Record<string, unknown>;
}): { id: string; isNew: boolean } {
  const db = getDatabase();
  const id = uuidv4();
  const now = new Date().toISOString();

  const existing = db.prepare(
    'SELECT id FROM jobs WHERE source = ? AND source_id = ?'
  ).get(job.source, job.sourceId) as { id: string } | undefined;

  if (existing) {
    db.prepare(`
      UPDATE jobs SET
        url = ?, title = ?, company = ?, description = ?, location = ?,
        location_type = ?, seniority = ?, category = ?, salary_min = ?,
        salary_max = ?, tags = ?, chains = ?, posted_at = ?, scraped_at = ?,
        raw_data = ?
      WHERE id = ?
    `).run(
      job.url ?? null, job.title, job.company ?? null, job.description ?? null,
      job.location ?? null, job.locationType ?? null, job.seniority ?? null,
      job.category ?? null, job.salaryMin ?? null, job.salaryMax ?? null,
      JSON.stringify(job.tags ?? []), JSON.stringify(job.chains ?? []),
      job.postedAt ?? null, now, JSON.stringify(job.rawData ?? {}),
      existing.id
    );
    return { id: existing.id, isNew: false };
  }

  db.prepare(`
    INSERT INTO jobs (id, source, source_id, url, title, company, description,
      location, location_type, seniority, category, salary_min, salary_max,
      tags, chains, posted_at, scraped_at, raw_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, job.source, job.sourceId, job.url ?? null, job.title,
    job.company ?? null, job.description ?? null, job.location ?? null,
    job.locationType ?? null, job.seniority ?? null, job.category ?? null,
    job.salaryMin ?? null, job.salaryMax ?? null,
    JSON.stringify(job.tags ?? []), JSON.stringify(job.chains ?? []),
    job.postedAt ?? null, now, JSON.stringify(job.rawData ?? {})
  );
  return { id, isNew: true };
}

export function getJobs(filters: JobFilters = {}): { jobs: JobWithScore[]; total: number } {
  const db = getDatabase();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.source) {
    conditions.push('j.source = ?');
    params.push(filters.source);
  }
  if (filters.minScore != null) {
    conditions.push('s.overall_score >= ?');
    params.push(filters.minScore);
  }
  if (filters.category) {
    conditions.push('j.category = ?');
    params.push(filters.category);
  }
  if (filters.location) {
    conditions.push('j.location = ?');
    params.push(filters.location);
  }
  if (filters.seniority) {
    conditions.push('j.seniority = ?');
    params.push(filters.seniority);
  }
  if (filters.search) {
    conditions.push('(j.title LIKE ? OR j.company LIKE ? OR j.description LIKE ?)');
    const term = `%${filters.search}%`;
    params.push(term, term, term);
  }
  if (filters.action) {
    conditions.push('a.action = ?');
    params.push(filters.action);
  }
  if (filters.excludeAction) {
    conditions.push('NOT EXISTS (SELECT 1 FROM job_actions ea WHERE ea.job_id = j.id AND ea.action = ?)');
    params.push(filters.excludeAction);
  }
  if (filters.noAction) {
    conditions.push('a.action IS NULL');
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  let orderBy = 'ORDER BY s.overall_score DESC NULLS LAST, j.scraped_at DESC';
  if (filters.sort === 'date') {
    orderBy = 'ORDER BY j.posted_at DESC NULLS LAST';
  } else if (filters.sort === 'score') {
    orderBy = 'ORDER BY s.overall_score DESC NULLS LAST';
  } else if (filters.sort === 'company') {
    orderBy = 'ORDER BY j.company ASC NULLS LAST';
  }

  const page = filters.page ?? 1;
  const limit = filters.limit ?? 50;
  const offset = (page - 1) * limit;

  const countRow = db.prepare(`
    SELECT COUNT(*) as total FROM jobs j
    LEFT JOIN job_scores s ON j.id = s.job_id
    LEFT JOIN job_actions a ON j.id = a.job_id
    ${where}
  `).get(...params) as { total: number };

  const rows = db.prepare(`
    SELECT
      j.id, j.source, j.source_id as sourceId, j.url, j.title, j.company,
      j.description, j.location, j.location_type as locationType,
      j.seniority, j.category, j.salary_min as salaryMin,
      j.salary_max as salaryMax, j.tags, j.chains,
      j.posted_at as postedAt, j.scraped_at as scrapedAt, j.raw_data as rawData,
      s.overall_score as overallScore, s.relevance_score as relevanceScore,
      s.experience_match as experienceMatch, s.domain_match as domainMatch,
      s.seniority_fit as seniorityFit, s.reasoning,
      (SELECT GROUP_CONCAT(action, ',') FROM job_actions WHERE job_id = j.id) as actions
    FROM jobs j
    LEFT JOIN job_scores s ON j.id = s.job_id
    LEFT JOIN job_actions a ON j.id = a.job_id
    ${where}
    ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as JobWithScore[];

  return { jobs: rows, total: countRow.total };
}

export function getFilterOptions(): { categories: string[]; locations: string[] } {
  const db = getDatabase();
  const categories = db.prepare(
    'SELECT DISTINCT category FROM jobs WHERE category IS NOT NULL ORDER BY category'
  ).all() as { category: string }[];
  const locations = db.prepare(
    'SELECT DISTINCT location FROM jobs WHERE location IS NOT NULL ORDER BY location'
  ).all() as { location: string }[];
  return {
    categories: categories.map(r => r.category),
    locations: locations.map(r => r.location),
  };
}

export function getJobById(id: string): (Omit<JobWithScore, 'actions'> & { actions: { action: string; notes: string | null; createdAt: string }[] }) | null {
  const db = getDatabase();

  const job = db.prepare(`
    SELECT
      j.id, j.source, j.source_id as sourceId, j.url, j.title, j.company,
      j.description, j.location, j.location_type as locationType,
      j.seniority, j.category, j.salary_min as salaryMin,
      j.salary_max as salaryMax, j.tags, j.chains,
      j.posted_at as postedAt, j.scraped_at as scrapedAt, j.raw_data as rawData,
      s.overall_score as overallScore, s.relevance_score as relevanceScore,
      s.experience_match as experienceMatch, s.domain_match as domainMatch,
      s.seniority_fit as seniorityFit, s.reasoning
    FROM jobs j
    LEFT JOIN job_scores s ON j.id = s.job_id
    WHERE j.id = ?
  `).get(id) as JobWithScore | undefined;

  if (!job) return null;

  const actions = db.prepare(`
    SELECT action, notes, created_at as createdAt
    FROM job_actions WHERE job_id = ?
  `).all(id) as { action: string; notes: string | null; createdAt: string }[];

  return { ...job, actions };
}

export function getUnscoredJobs(limit: number = 50): { id: string; title: string; company: string | null; description: string | null; seniority: string | null; category: string | null; tags: string; chains: string; rawData: string }[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT j.id, j.title, j.company, j.description, j.seniority, j.category, j.tags, j.chains, j.raw_data as rawData
    FROM jobs j
    LEFT JOIN job_scores s ON j.id = s.job_id
    WHERE s.job_id IS NULL
    LIMIT ?
  `).all(limit) as any[];
}

export function upsertScore(score: {
  jobId: string;
  overallScore: number;
  relevanceScore: number;
  experienceMatch: number;
  domainMatch: number;
  seniorityFit: number;
  reasoning: string;
  modelUsed: string;
}): void {
  const db = getDatabase();
  db.prepare(`
    INSERT OR REPLACE INTO job_scores
      (job_id, overall_score, relevance_score, experience_match, domain_match,
       seniority_fit, reasoning, scored_at, model_used)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    score.jobId, score.overallScore, score.relevanceScore,
    score.experienceMatch, score.domainMatch, score.seniorityFit,
    score.reasoning, new Date().toISOString(), score.modelUsed
  );
}

export function addAction(jobId: string, action: string, notes?: string): void {
  const db = getDatabase();
  db.prepare(`
    INSERT OR REPLACE INTO job_actions (job_id, action, notes, created_at)
    VALUES (?, ?, ?, ?)
  `).run(jobId, action, notes ?? null, new Date().toISOString());
}

export function removeAction(jobId: string, action?: string): void {
  const db = getDatabase();
  if (action) {
    db.prepare('DELETE FROM job_actions WHERE job_id = ? AND action = ?').run(jobId, action);
  } else {
    db.prepare('DELETE FROM job_actions WHERE job_id = ?').run(jobId);
  }
}

export function getJobStats(): {
  total: number;
  scored: number;
  avgScore: number;
  bySource: Record<string, number>;
  byCategory: Record<string, number>;
  lastScrape: string | null;
} {
  const db = getDatabase();

  const total = (db.prepare('SELECT COUNT(*) as c FROM jobs').get() as { c: number }).c;
  const scored = (db.prepare('SELECT COUNT(*) as c FROM job_scores').get() as { c: number }).c;
  const avgRow = db.prepare('SELECT AVG(overall_score) as avg FROM job_scores').get() as { avg: number | null };

  const sources = db.prepare('SELECT source, COUNT(*) as c FROM jobs GROUP BY source').all() as { source: string; c: number }[];
  const bySource: Record<string, number> = {};
  for (const s of sources) bySource[s.source] = s.c;

  const categories = db.prepare('SELECT category, COUNT(*) as c FROM jobs WHERE category IS NOT NULL GROUP BY category').all() as { category: string; c: number }[];
  const byCategory: Record<string, number> = {};
  for (const c of categories) byCategory[c.category] = c.c;

  const lastRun = db.prepare('SELECT completed_at FROM scrape_runs ORDER BY completed_at DESC LIMIT 1').get() as { completed_at: string } | undefined;

  return {
    total,
    scored,
    avgScore: Math.round(avgRow.avg ?? 0),
    bySource,
    byCategory,
    lastScrape: lastRun?.completed_at ?? null,
  };
}

// --- Scrape Runs ---

export function startScrapeRun(source: string): number {
  const db = getDatabase();
  const result = db.prepare(
    'INSERT INTO scrape_runs (source, started_at) VALUES (?, ?)'
  ).run(source, new Date().toISOString());
  return result.lastInsertRowid as number;
}

export function completeScrapeRun(id: number, status: string, jobsFound: number, jobsNew: number, error?: string): void {
  const db = getDatabase();
  db.prepare(`
    UPDATE scrape_runs SET completed_at = ?, status = ?, jobs_found = ?, jobs_new = ?, error = ?
    WHERE id = ?
  `).run(new Date().toISOString(), status, jobsFound, jobsNew, error ?? null, id);
}

export function getScrapeRuns(limit: number = 20): any[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT id, source, started_at as startedAt, completed_at as completedAt,
           status, jobs_found as jobsFound, jobs_new as jobsNew, error
    FROM scrape_runs ORDER BY started_at DESC LIMIT ?
  `).all(limit);
}
