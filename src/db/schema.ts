import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '../../data/jobs.db');

export function initializeDatabase(): Database.Database {
  const db = new Database(DB_PATH);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      url TEXT,
      title TEXT NOT NULL,
      company TEXT,
      description TEXT,
      location TEXT,
      location_type TEXT,
      seniority TEXT,
      category TEXT,
      salary_min INTEGER,
      salary_max INTEGER,
      tags TEXT DEFAULT '[]',
      chains TEXT DEFAULT '[]',
      posted_at TEXT,
      scraped_at TEXT NOT NULL,
      raw_data TEXT DEFAULT '{}',
      UNIQUE(source, source_id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS job_scores (
      job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
      overall_score INTEGER NOT NULL,
      relevance_score INTEGER NOT NULL,
      experience_match INTEGER NOT NULL,
      domain_match INTEGER NOT NULL,
      seniority_fit INTEGER NOT NULL,
      reasoning TEXT,
      scored_at TEXT NOT NULL,
      model_used TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS job_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(job_id, action)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS scrape_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      jobs_found INTEGER DEFAULT 0,
      jobs_new INTEGER DEFAULT 0,
      error TEXT
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_jobs_source ON jobs(source);
    CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs(category);
    CREATE INDEX IF NOT EXISTS idx_job_scores_overall ON job_scores(overall_score);
    CREATE INDEX IF NOT EXISTS idx_job_actions_job_id ON job_actions(job_id);
  `);

  return db;
}

export type { Database };
