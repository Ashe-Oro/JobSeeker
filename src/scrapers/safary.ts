// @ts-nocheck - page.evaluate() callbacks run in browser context (DOM types)
import { ScraperAdapter, RawJob } from './types';
import { EXCLUDED_TITLE_PATTERNS, isLocationUSOrRemote } from './filters';

const SAFARY_URL = 'https://jobs.safary.club/jobs';
const TIMEOUT_MS = 30000;

export class SafaryAdapter implements ScraperAdapter {
  name = 'safary';

  async scrape(): Promise<RawJob[]> {
    let chromium;
    try {
      const pw = await import('playwright');
      chromium = pw.chromium;
    } catch {
      console.error('[Safary] Playwright not installed. Run: npx playwright install chromium');
      return [];
    }

    console.log('[Safary] Launching browser...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();

    try {
      console.log('[Safary] Navigating to job board...');
      await page.goto(SAFARY_URL, { waitUntil: 'networkidle', timeout: TIMEOUT_MS });

      // Wait for job cards to render (client-side hydration)
      await page.waitForSelector('[class*="job"], [class*="Job"], a[href*="/jobs/"], tr, .card', {
        timeout: 10000,
      }).catch(() => {
        console.log('[Safary] No standard job selectors found, trying scroll approach...');
      });

      // Scroll to load all lazy-loaded listings
      let previousHeight = 0;
      for (let i = 0; i < 20; i++) {
        const currentHeight = await page.evaluate(() => document.body.scrollHeight);
        if (currentHeight === previousHeight) break;
        previousHeight = currentHeight;
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);
      }

      // Extract jobs from the page
      const jobs = await page.evaluate(() => {
        const results: {
          title: string;
          company: string;
          location: string;
          url: string;
          seniority: string;
          category: string;
          salary: string;
        }[] = [];

        // Try common job board patterns
        // Pattern 1: Link-based job cards
        const links = document.querySelectorAll('a[href*="/jobs/"], a[href*="/job/"]');
        const seen = new Set<string>();

        for (const link of links) {
          const href = (link as HTMLAnchorElement).href;
          if (seen.has(href)) continue;
          seen.add(href);

          const el = link as HTMLElement;
          const text = el.innerText.trim();
          if (!text || text.length < 5) continue;

          const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
          if (lines.length === 0) continue;

          results.push({
            title: lines[0] || '',
            company: lines[1] || '',
            location: lines.find(l => /remote|onsite|hybrid|city|state/i.test(l)) || '',
            url: href,
            seniority: lines.find(l => /senior|junior|lead|staff|principal|intern|entry/i.test(l)) || '',
            category: lines.find(l => /engineer|design|product|market|sales|operations|business/i.test(l)) || '',
            salary: lines.find(l => /\$|salary|compensation|k\b/i.test(l)) || '',
          });
        }

        // Pattern 2: Table rows
        if (results.length === 0) {
          const rows = document.querySelectorAll('tr, [role="row"]');
          for (const row of rows) {
            const cells = row.querySelectorAll('td, [role="cell"]');
            if (cells.length < 2) continue;
            const title = cells[0]?.textContent?.trim() || '';
            if (!title || title.length < 3) continue;

            const rowLink = row.querySelector('a');
            results.push({
              title,
              company: cells[1]?.textContent?.trim() || '',
              location: cells[2]?.textContent?.trim() || '',
              url: rowLink?.href || '',
              seniority: '',
              category: '',
              salary: '',
            });
          }
        }

        return results;
      });

      console.log(`[Safary] Extracted ${jobs.length} job listings`);

      let skippedTitle = 0;
      let skippedLocation = 0;

      const rawJobs: RawJob[] = [];
      for (const [i, j] of jobs.entries()) {
        if (!j.title || j.title.length <= 2) continue;

        // Filter: skip junior/intern by title
        if (EXCLUDED_TITLE_PATTERNS.test(j.title)) {
          skippedTitle++;
          continue;
        }

        // Filter: must be remote or US-based
        if (!isLocationUSOrRemote(j.location)) {
          skippedLocation++;
          continue;
        }

        rawJobs.push({
          sourceId: j.url || `safary-${i}-${j.title.slice(0, 30)}`,
          url: j.url || undefined,
          title: j.title,
          company: j.company || undefined,
          location: j.location || undefined,
          seniority: j.seniority || undefined,
          category: j.category || undefined,
          rawData: j as unknown as Record<string, unknown>,
        });
      }

      console.log(`[Safary] ${rawJobs.length} jobs kept (skipped: ${skippedTitle} by title, ${skippedLocation} non-US/non-remote)`);
      return rawJobs;
    } finally {
      await browser.close();
      console.log('[Safary] Browser closed.');
    }
  }
}
