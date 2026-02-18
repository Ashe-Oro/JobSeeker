import { useState, useEffect, useCallback } from 'react';
import {
  fetchJobs, fetchStats, fetchFilterOptions, scrapeAndScore,
  addJobAction, removeJobAction,
  type Job, type Stats, type Filters, type FilterOptions,
} from '../api';

const SCORE_COLORS: Record<string, string> = {
  high: '#2ea043',
  mid: '#d29922',
  low: '#f85149',
};

function scoreColor(score: number | null): string {
  if (score == null) return '#484f58';
  if (score >= 70) return SCORE_COLORS.high;
  if (score >= 40) return SCORE_COLORS.mid;
  return SCORE_COLORS.low;
}

function formatDate(d: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const styles = {
  statsBar: {
    display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' as const,
  },
  statCard: {
    background: '#161b22', border: '1px solid #30363d', borderRadius: 8,
    padding: '12px 20px', minWidth: 120,
  },
  statLabel: { fontSize: 12, color: '#8b949e', marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: 700 as const },
  filterBar: {
    display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' as const,
    alignItems: 'center',
  },
  input: {
    background: '#0d1117', border: '1px solid #30363d', borderRadius: 6,
    color: '#e1e4e8', padding: '6px 12px', fontSize: 14, outline: 'none',
  },
  select: {
    background: '#0d1117', border: '1px solid #30363d', borderRadius: 6,
    color: '#e1e4e8', padding: '6px 12px', fontSize: 14, outline: 'none',
  },
  btn: {
    background: '#238636', border: 'none', borderRadius: 6, color: '#fff',
    padding: '8px 16px', fontSize: 14, cursor: 'pointer', fontWeight: 600 as const,
  },
  btnSecondary: {
    background: '#21262d', border: '1px solid #30363d', borderRadius: 6,
    color: '#c9d1d9', padding: '8px 16px', fontSize: 14, cursor: 'pointer',
  },
  btnSmall: {
    background: 'transparent', border: '1px solid #30363d', borderRadius: 4,
    color: '#8b949e', padding: '4px 8px', fontSize: 12, cursor: 'pointer',
  },
  jobRow: {
    display: 'grid',
    gridTemplateColumns: '60px 1fr 140px 100px 100px 80px 100px',
    alignItems: 'center', gap: 12,
    padding: '12px 16px', borderBottom: '1px solid #21262d',
  },
  jobRowHeader: {
    display: 'grid',
    gridTemplateColumns: '60px 1fr 140px 100px 100px 80px 100px',
    gap: 12, padding: '8px 16px', fontSize: 12, color: '#8b949e',
    borderBottom: '1px solid #30363d', fontWeight: 600 as const,
  },
  scoreBadge: (score: number | null) => ({
    display: 'inline-block', padding: '2px 10px', borderRadius: 12,
    fontSize: 14, fontWeight: 700 as const, textAlign: 'center' as const,
    background: `${scoreColor(score)}22`, color: scoreColor(score),
    minWidth: 40,
  }),
  modal: {
    position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center',
    alignItems: 'flex-start', paddingTop: 60, zIndex: 100,
  },
  modalContent: {
    background: '#161b22', border: '1px solid #30363d', borderRadius: 12,
    padding: 24, maxWidth: 700, width: '90%', maxHeight: '80vh',
    overflow: 'auto' as const,
  },
  pagination: {
    display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20,
    alignItems: 'center',
  },
  tab: (active: boolean) => ({
    background: active ? '#161b22' : 'transparent',
    border: active ? '1px solid #30363d' : '1px solid transparent',
    borderBottom: active ? '1px solid #161b22' : '1px solid #30363d',
    borderRadius: '8px 8px 0 0',
    color: active ? '#e1e4e8' : '#8b949e',
    padding: '10px 20px', fontSize: 14, cursor: 'pointer',
    fontWeight: active ? 600 as const : 400 as const,
    marginBottom: -1,
  }),
  tabBar: {
    display: 'flex', gap: 0, borderBottom: '1px solid #30363d', marginBottom: 20,
  },
};

export default function JobsPage() {
  const [view, setView] = useState<'all' | 'starred'>('all');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filters, setFilters] = useState<Filters>({ page: 1, limit: 50, sort: 'score' });
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({ categories: [], locations: [] });

  useEffect(() => {
    fetchFilterOptions().then(setFilterOptions).catch(console.error);
  }, []);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const activeFilters = view === 'starred'
        ? { ...filters, action: 'bookmark' }
        : { ...filters, excludeAction: 'hide' };
      const [jobsData, statsData] = await Promise.all([
        fetchJobs(activeFilters),
        fetchStats(),
      ]);
      setJobs(jobsData.jobs);
      setTotal(jobsData.total);
      setStats(statsData);
    } catch (e) {
      console.error('Failed to load:', e);
    } finally {
      setLoading(false);
    }
  }, [filters, view]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const handleScrapeAll = async () => {
    setSyncing(true);
    setSyncStatus('Scraping new jobs...');
    try {
      const result = await scrapeAndScore();
      const totalNew = Object.values(result.scrapeResults ?? {}).reduce((sum: number, r: any) => sum + (r.jobsNew ?? 0), 0);
      if (totalNew > 0) {
        setSyncStatus(`Found ${totalNew} new jobs, scored ${result.scored}. Refreshing...`);
      } else {
        setSyncStatus('No new jobs found.');
      }
      await loadJobs();
      fetchFilterOptions().then(setFilterOptions).catch(console.error);
      setTimeout(() => setSyncStatus(''), 4000);
    } catch {
      setSyncStatus('Sync failed.');
      setTimeout(() => setSyncStatus(''), 4000);
    } finally {
      setSyncing(false);
    }
  };

  const handleAction = async (jobId: string, action: string) => {
    await addJobAction(jobId, action);
    await loadJobs();
  };

  const dismissJob = async (jobId: string) => {
    setJobs(prev => prev.filter(j => j.id !== jobId));
    setTotal(prev => prev - 1);
    await addJobAction(jobId, 'hide');
  };

  const handleRemoveAction = async (jobId: string, action: string) => {
    await removeJobAction(jobId, action);
    await loadJobs();
  };

  const isBookmarked = (job: Job) => job.actions?.split(',').includes('bookmark') ?? false;

  const toggleStar = async (jobId: string, job: Job) => {
    if (isBookmarked(job)) {
      await removeJobAction(jobId, 'bookmark');
    } else {
      await addJobAction(jobId, 'bookmark');
    }
    await loadJobs();
  };

  const updateFilter = (key: keyof Filters, value: string | number | boolean | undefined) => {
    setFilters(f => ({ ...f, [key]: value, page: 1 }));
  };

  const totalPages = Math.ceil(total / (filters.limit ?? 50));

  const switchView = (v: 'all' | 'starred') => {
    setView(v);
    setFilters(f => ({ ...f, page: 1 }));
  };

  return (
    <>
      {/* View Tabs */}
      <div style={styles.tabBar}>
        <button style={styles.tab(view === 'all')} onClick={() => switchView('all')}>
          All Jobs
        </button>
        <button style={styles.tab(view === 'starred')} onClick={() => switchView('starred')}>
          Starred
        </button>
      </div>

      {/* Stats Bar */}
      <div style={styles.statsBar}>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Total Jobs</div>
          <div style={styles.statValue}>{stats?.total ?? 0}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Scored</div>
          <div style={styles.statValue}>{stats?.scored ?? 0}</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Avg Score</div>
          <div style={styles.statValue}>{stats?.avgScore ?? 0}</div>
        </div>
        {stats?.bySource && Object.entries(stats.bySource).map(([source, count]) => (
          <div key={source} style={styles.statCard}>
            <div style={styles.statLabel}>{source}</div>
            <div style={styles.statValue}>{count}</div>
          </div>
        ))}
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Last Scrape</div>
          <div style={{ ...styles.statValue, fontSize: 14 }}>
            {stats?.lastScrape ? formatDate(stats.lastScrape) : 'Never'}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div style={styles.filterBar}>
        <input
          type="text"
          placeholder="Search jobs..."
          style={{ ...styles.input, minWidth: 200 }}
          value={filters.search ?? ''}
          onChange={e => updateFilter('search', e.target.value || undefined)}
        />
        <select
          style={styles.select}
          value={filters.source ?? ''}
          onChange={e => updateFilter('source', e.target.value || undefined)}
        >
          <option value="">All Sources</option>
          <option value="jobstash">JobStash</option>
          <option value="safary">Safary</option>
          <option value="web3career">Web3.career</option>
          <option value="cryptojobslist">CryptoJobsList</option>
        </select>
        <select
          style={styles.select}
          value={filters.category ?? ''}
          onChange={e => updateFilter('category', e.target.value || undefined)}
        >
          <option value="">All Categories</option>
          {filterOptions.categories.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          style={styles.select}
          value={filters.location ?? ''}
          onChange={e => updateFilter('location', e.target.value || undefined)}
        >
          <option value="">All Locations</option>
          {filterOptions.locations.map(l => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <select
          style={styles.select}
          value={filters.sort ?? 'score'}
          onChange={e => updateFilter('sort', e.target.value)}
        >
          <option value="score">Sort: Score</option>
          <option value="date">Sort: Date</option>
          <option value="company">Sort: Company</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: '#8b949e' }}>
          Min Score:
          <input
            type="range" min={0} max={100} step={5}
            value={filters.minScore ?? 0}
            onChange={e => updateFilter('minScore', Number(e.target.value) || undefined)}
          />
          <span style={{ minWidth: 24 }}>{filters.minScore ?? 0}</span>
        </label>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {syncStatus && <span style={{ fontSize: 13, color: '#8b949e' }}>{syncStatus}</span>}
          <button style={styles.btn} disabled={syncing} onClick={handleScrapeAll}>
            {syncing ? 'Syncing...' : 'Scrape All'}
          </button>
        </div>
      </div>

      {/* Job List */}
      <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, overflow: 'hidden' }}>
        <div style={styles.jobRowHeader}>
          <span>Score</span>
          <span>Title / Company</span>
          <span>Category</span>
          <span>Seniority</span>
          <span>Location</span>
          <span>Source</span>
          <span>Actions</span>
        </div>

        {loading && <div style={{ padding: 40, textAlign: 'center', color: '#8b949e' }}>Loading...</div>}

        {!loading && jobs.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#8b949e' }}>
            {view === 'starred' ? 'No starred jobs yet. Star jobs from the All Jobs tab.' : 'No jobs found. Try scraping first.'}
          </div>
        )}

        {!loading && jobs.map(job => (
          <div
            key={job.id}
            style={{ ...styles.jobRow, cursor: 'pointer' }}
            onClick={() => setSelectedJob(job)}
            onMouseEnter={e => (e.currentTarget.style.background = '#1c2128')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={styles.scoreBadge(job.overallScore)}>
              {job.overallScore ?? '-'}
            </span>
            <div>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>{job.title}</div>
              <div style={{ fontSize: 13, color: '#8b949e' }}>{job.company ?? 'Unknown'}</div>
            </div>
            <span style={{ fontSize: 13, color: '#8b949e' }}>{job.category ?? ''}</span>
            <span style={{ fontSize: 13, color: '#8b949e' }}>{job.seniority ?? ''}</span>
            <span style={{ fontSize: 13, color: '#8b949e' }}>{job.location ?? ''}</span>
            <span style={{ fontSize: 12, color: '#58a6ff' }}>{job.source}</span>
            <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
              <button
                style={isBookmarked(job) ? { ...styles.btnSmall, color: '#d29922' } : styles.btnSmall}
                title={isBookmarked(job) ? 'Unstar' : 'Star'}
                onClick={() => toggleStar(job.id, job)}
              >
                {isBookmarked(job) ? '\u2605' : '\u2606'}
              </button>
              <button style={styles.btnSmall} title="Dismiss" onClick={() => dismissJob(job.id)}>
                &#10005;
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={styles.pagination}>
          <button
            style={styles.btnSecondary}
            disabled={filters.page === 1}
            onClick={() => setFilters(f => ({ ...f, page: (f.page ?? 1) - 1 }))}
          >
            Prev
          </button>
          <span style={{ color: '#8b949e', fontSize: 14 }}>
            Page {filters.page ?? 1} of {totalPages}
          </span>
          <button
            style={styles.btnSecondary}
            disabled={(filters.page ?? 1) >= totalPages}
            onClick={() => setFilters(f => ({ ...f, page: (f.page ?? 1) + 1 }))}
          >
            Next
          </button>
        </div>
      )}

      {/* Job Detail Modal */}
      {selectedJob && (
        <div style={styles.modal} onClick={() => setSelectedJob(null)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 20, marginBottom: 4 }}>{selectedJob.title}</h2>
                <div style={{ color: '#8b949e' }}>{selectedJob.company ?? 'Unknown Company'}</div>
              </div>
              <button style={styles.btnSmall} onClick={() => setSelectedJob(null)}>Close</button>
            </div>

            <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={styles.scoreBadge(selectedJob.overallScore)}>
                Overall: {selectedJob.overallScore ?? 'Unscored'}
              </div>
              {selectedJob.relevanceScore != null && (
                <span style={{ fontSize: 13, color: '#8b949e' }}>
                  Relevance: {selectedJob.relevanceScore} | Experience: {selectedJob.experienceMatch} | Domain: {selectedJob.domainMatch} | Seniority: {selectedJob.seniorityFit}
                </span>
              )}
            </div>

            {selectedJob.reasoning && (
              <div style={{ background: '#0d1117', padding: 12, borderRadius: 6, marginBottom: 16, fontSize: 14, lineHeight: 1.5 }}>
                {selectedJob.reasoning}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', fontSize: 13, color: '#8b949e' }}>
              {selectedJob.location && <span>Location: {selectedJob.location}</span>}
              {selectedJob.seniority && <span>Seniority: {selectedJob.seniority}</span>}
              {selectedJob.category && <span>Category: {selectedJob.category}</span>}
              {selectedJob.salaryMin != null && (
                <span>Salary: ${selectedJob.salaryMin.toLocaleString()}{selectedJob.salaryMax ? ` - $${selectedJob.salaryMax.toLocaleString()}` : '+'}</span>
              )}
              {selectedJob.postedAt && <span>Posted: {formatDate(selectedJob.postedAt)}</span>}
            </div>

            {selectedJob.description && (
              <div style={{ fontSize: 14, lineHeight: 1.6, color: '#c9d1d9', whiteSpace: 'pre-wrap', maxHeight: 300, overflow: 'auto' }}>
                {selectedJob.description}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              {selectedJob.url && (
                <a href={selectedJob.url} target="_blank" rel="noopener noreferrer" style={{ ...styles.btn, textDecoration: 'none' }}>
                  View Original
                </a>
              )}
              <button style={styles.btnSecondary} onClick={() => { toggleStar(selectedJob.id, selectedJob); setSelectedJob(null); }}>
                {isBookmarked(selectedJob) ? 'Unstar' : 'Bookmark'}
              </button>
              <button style={{ ...styles.btnSecondary, borderColor: '#f85149', color: '#f85149' }} onClick={() => { dismissJob(selectedJob.id); setSelectedJob(null); }}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
