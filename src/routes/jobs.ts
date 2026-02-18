import { Router, Request, Response } from 'express';
import {
  getJobs,
  getJobById,
  getJobStats,
  getFilterOptions,
  addAction,
  removeAction,
  getScrapeRuns,
} from '../db';
import { runScraper, runAllScrapers } from '../scrapers/runner';
import { scoreUnscored } from '../scorer/scorer';

const router = Router();

// GET /api/jobs/stats - must come before :id route
router.get('/jobs/stats', (_req: Request, res: Response) => {
  try {
    const stats = getJobStats();
    res.json({ success: true, ...stats });
  } catch (error) {
    console.error('[API] Stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to get stats' });
  }
});

// GET /api/jobs - list with filters
router.get('/jobs', (req: Request, res: Response) => {
  try {
    const filters = {
      source: req.query.source as string | undefined,
      minScore: req.query.minScore ? Number(req.query.minScore) : undefined,
      category: req.query.category as string | undefined,
      location: req.query.location as string | undefined,
      seniority: req.query.seniority as string | undefined,
      search: req.query.search as string | undefined,
      action: req.query.action as string | undefined,
      excludeAction: req.query.excludeAction as string | undefined,
      noAction: req.query.noAction === 'true',
      sort: req.query.sort as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    };

    const result = getJobs(filters);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[API] Jobs list error:', error);
    res.status(500).json({ success: false, error: 'Failed to list jobs' });
  }
});

// GET /api/jobs/filters - distinct filter options
router.get('/jobs/filters', (_req: Request, res: Response) => {
  try {
    const options = getFilterOptions();
    res.json({ success: true, ...options });
  } catch (error) {
    console.error('[API] Filter options error:', error);
    res.status(500).json({ success: false, error: 'Failed to get filter options' });
  }
});

// GET /api/jobs/:id - single job with score and actions
router.get('/jobs/:id', (req: Request, res: Response) => {
  try {
    const job = getJobById(req.params.id);
    if (!job) {
      res.status(404).json({ success: false, error: 'Job not found' });
      return;
    }
    res.json({ success: true, job });
  } catch (error) {
    console.error('[API] Job detail error:', error);
    res.status(500).json({ success: false, error: 'Failed to get job' });
  }
});

// POST /api/jobs/scrape - trigger scrape
router.post('/jobs/scrape', async (req: Request, res: Response) => {
  try {
    const source = (req.body.source as string) || 'all';

    if (source === 'all') {
      const results = await runAllScrapers();
      res.json({ success: true, results });
    } else {
      const result = await runScraper(source);
      res.json({ success: true, source, ...result });
    }
  } catch (error) {
    console.error('[API] Scrape error:', error);
    res.status(500).json({ success: false, error: 'Scrape failed' });
  }
});

// POST /api/jobs/score - score unscored jobs
router.post('/jobs/score', async (req: Request, res: Response) => {
  try {
    const limit = req.body.limit ? Number(req.body.limit) : 50;
    const scored = await scoreUnscored(limit);
    res.json({ success: true, scored });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[API] Score error:', message);
    res.status(500).json({ success: false, error: message });
  }
});

// POST /api/jobs/scrape-and-score - scrape all sources then score new jobs
router.post('/jobs/scrape-and-score', async (_req: Request, res: Response) => {
  try {
    console.log('[API] Starting scrape-and-score for all sources...');
    const scrapeResults = await runAllScrapers();

    const totalNew = Object.values(scrapeResults).reduce((sum, r) => sum + r.jobsNew, 0);
    console.log(`[API] Scrape done. ${totalNew} new jobs. Scoring unscored...`);

    let scored = 0;
    if (totalNew > 0) {
      scored = await scoreUnscored(totalNew);
    }

    res.json({ success: true, scrapeResults, scored });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[API] Scrape-and-score error:', message);
    res.status(500).json({ success: false, error: message });
  }
});

// POST /api/jobs/:id/action - record action
router.post('/jobs/:id/action', (req: Request, res: Response) => {
  try {
    const { action, notes } = req.body;
    if (!action) {
      res.status(400).json({ success: false, error: 'action is required' });
      return;
    }
    addAction(req.params.id, action, notes);
    res.json({ success: true });
  } catch (error) {
    console.error('[API] Action error:', error);
    res.status(500).json({ success: false, error: 'Failed to add action' });
  }
});

// DELETE /api/jobs/:id/action - remove action
router.delete('/jobs/:id/action', (req: Request, res: Response) => {
  try {
    const action = req.query.action as string | undefined;
    removeAction(req.params.id, action);
    res.json({ success: true });
  } catch (error) {
    console.error('[API] Remove action error:', error);
    res.status(500).json({ success: false, error: 'Failed to remove action' });
  }
});

// GET /api/scrape-runs - recent scrape history
router.get('/scrape-runs', (_req: Request, res: Response) => {
  try {
    const runs = getScrapeRuns();
    res.json({ success: true, runs });
  } catch (error) {
    console.error('[API] Scrape runs error:', error);
    res.status(500).json({ success: false, error: 'Failed to get scrape runs' });
  }
});

export default router;
