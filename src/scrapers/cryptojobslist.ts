// @ts-nocheck - page.evaluate() callbacks run in browser context (DOM types)
import { ScraperAdapter, RawJob } from './types';
import { EXCLUDED_TITLE_PATTERNS, isLocationUSOrRemote } from './filters';

const BASE_URL = 'https://cryptojobslist.com';
const TIMEOUT_MS = 45000;
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

// Category paths for BD / product roles
const CATEGORY_PATHS = [
  '/business-development',
  '/product',
  '/growth',
  '/marketing',
  '/operations',
];

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class CryptoJobsListAdapter implements ScraperAdapter {
  name = 'cryptojobslist';

  async scrape(): Promise<RawJob[]> {
    let chromium;
    try {
      const pw = await import('playwright');
      chromium = pw.chromium;
    } catch {
      console.error('[CryptoJobsList] Playwright not installed. Run: npx playwright install chromium');
      return [];
    }

    console.log('[CryptoJobsList] Launching browser...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: USER_AGENT });

    const allJobs: RawJob[] = [];
    const seenUrls = new Set<string>();
    let skippedTitle = 0;
    let skippedLocation = 0;

    try {
      for (const categoryPath of CATEGORY_PATHS) {
        const url = `${BASE_URL}${categoryPath}`;
        console.log(`[CryptoJobsList] Navigating to ${url}...`);

        const page = await context.newPage();
        try {
          // Use domcontentloaded — networkidle hangs on Cloudflare challenge pages
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });

          // Wait for Cloudflare challenge to resolve and content to appear
          try {
            await page.waitForSelector('a[href*="/jobs/"]', { timeout: 15000 });
          } catch {
            // Might be stuck on Cloudflare — wait a bit more and retry
            console.log(`[CryptoJobsList] Waiting for Cloudflare on ${categoryPath}...`);
            await delay(5000);
            const hasJobs = await page.$('a[href*="/jobs/"]');
            if (!hasJobs) {
              console.log(`[CryptoJobsList] Skipping ${categoryPath} — could not bypass Cloudflare`);
              await page.close();
              continue;
            }
          }

          // Scroll to load all lazy-loaded listings
          let previousHeight = 0;
          for (let i = 0; i < 15; i++) {
            const currentHeight = await page.evaluate(() => document.body.scrollHeight);
            if (currentHeight === previousHeight) break;
            previousHeight = currentHeight;
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(1500);
          }

          // Extract job listings
          const jobs = await page.evaluate((baseDomain: string) => {
            const results: {
              title: string;
              company: string;
              location: string;
              url: string;
              tags: string[];
            }[] = [];

            const links = document.querySelectorAll('a[href*="/jobs/"]');
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

              const tagEls = el.querySelectorAll('span, [class*="tag"], [class*="badge"]');
              const tags: string[] = [];
              tagEls.forEach(t => {
                const tagText = t.textContent?.trim();
                if (tagText && tagText.length < 30) tags.push(tagText);
              });

              results.push({
                title: lines[0] || '',
                company: lines[1] || '',
                location: lines.find(l =>
                  /remote|onsite|hybrid|usa|us|new york|san francisco|london|berlin|singapore|global|worldwide/i.test(l)
                ) || '',
                url: href.startsWith('http') ? href : `${baseDomain}${href}`,
                tags,
              });
            }

            return results;
          }, BASE_URL);

          console.log(`[CryptoJobsList] Extracted ${jobs.length} listings from ${categoryPath}`);

          for (const job of jobs) {
            if (!job.title || job.title.length <= 2) continue;
            if (seenUrls.has(job.url)) continue;
            seenUrls.add(job.url);

            if (EXCLUDED_TITLE_PATTERNS.test(job.title)) {
              skippedTitle++;
              continue;
            }

            if (!isLocationUSOrRemote(job.location)) {
              skippedLocation++;
              continue;
            }

            allJobs.push({
              sourceId: job.url || `cjl-${job.title.slice(0, 30)}`,
              url: job.url || undefined,
              title: job.title,
              company: job.company || undefined,
              location: job.location || undefined,
              category: categoryPath.replace('/', ''),
              tags: job.tags,
              rawData: job as unknown as Record<string, unknown>,
            });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[CryptoJobsList] Failed on ${categoryPath}: ${msg}`);
        } finally {
          await page.close();
        }

        // Delay between categories to avoid rate limiting
        await delay(3000);
      }

      console.log(`[CryptoJobsList] Scrape complete. ${allJobs.length} jobs kept (skipped: ${skippedTitle} by title, ${skippedLocation} non-US/non-remote)`);
      return allJobs;
    } finally {
      await browser.close();
      console.log('[CryptoJobsList] Browser closed.');
    }
  }
}
