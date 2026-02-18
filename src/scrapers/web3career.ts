import { ScraperAdapter, RawJob } from './types';
import { EXCLUDED_TITLE_PATTERNS, isLocationUSOrRemote } from './filters';

const BASE_URL = 'https://web3.career';
const DELAY_MS = 500;
const MAX_PAGES = 10;
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

// Category slugs relevant to BD / product roles (alphabetically sorted for URL)
const CATEGORY_PAGES = [
  'business-development-jobs',
  'product-jobs',
  'growth-jobs',
  'devrel-jobs',
  'management-jobs',
];

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseSalary(raw: string): { min?: number; max?: number } {
  // Formats: "$155k - $205k", "$120k+", "$80k - $120k"
  const cleaned = raw.replace(/<[^>]+>/g, '').trim();
  const matches = cleaned.match(/\$(\d+)k/g);
  if (!matches) return {};
  const values = matches.map(m => parseInt(m.replace(/\$|k/g, ''), 10) * 1000);
  return { min: values[0], max: values[1] ?? undefined };
}

function parseRows(html: string): {
  id: string;
  title: string;
  company: string;
  url: string;
  location: string;
  salary: string;
  postedAt: string;
}[] {
  const results: {
    id: string;
    title: string;
    company: string;
    url: string;
    location: string;
    salary: string;
    postedAt: string;
  }[] = [];
  const rowRegex = /<tr[^>]*table_row[^>]*>(.*?)<\/tr>/gs;
  let match;

  while ((match = rowRegex.exec(html)) !== null) {
    const row = match[1];

    const idMatch = row.match(/data-jobid=(\d+)/);
    const titleMatch = row.match(/<h2[^>]*>(.*?)<\/h2>/s);
    const companyMatch = row.match(/<h3[^>]*>(.*?)<\/h3>/s);
    const urlMatch = row.match(/href="(\/[^"]+\/\d+)"/);
    const locMatches = [...row.matchAll(/web3-jobs-[^"]+["'][^>]*>([^<]+)/g)];
    const salaryMatch = row.match(/text-salary[^>]*>(.*?)<\/p>/s);
    const dateMatch = row.match(/<time[^>]*datetime="([^"]+)"/);

    if (!titleMatch || !idMatch) continue;

    results.push({
      id: idMatch[1],
      title: titleMatch[1].trim(),
      company: companyMatch?.[1]?.trim() ?? '',
      url: urlMatch ? `${BASE_URL}${urlMatch[1]}` : '',
      location: locMatches.map(m => m[1].trim()).join(', '),
      salary: salaryMatch?.[1] ?? '',
      postedAt: dateMatch?.[1] ?? '',
    });
  }

  return results;
}

export class Web3CareerAdapter implements ScraperAdapter {
  name = 'web3career';

  async scrape(): Promise<RawJob[]> {
    const allJobs: RawJob[] = [];
    const seenIds = new Set<string>();
    let skippedTitle = 0;
    let skippedLocation = 0;

    for (const category of CATEGORY_PAGES) {
      for (let page = 1; page <= MAX_PAGES; page++) {
        const url = `${BASE_URL}/${category}?page=${page}`;
        console.log(`[Web3Career] Fetching ${category} page ${page}...`);

        const response = await fetch(url, {
          headers: { 'User-Agent': USER_AGENT },
          redirect: 'follow',
        });

        if (!response.ok) {
          console.error(`[Web3Career] HTTP ${response.status} on ${url}`);
          break;
        }

        const html = await response.text();
        const rows = parseRows(html);

        if (rows.length === 0) {
          console.log(`[Web3Career] No more jobs for ${category} on page ${page}`);
          break;
        }

        for (const row of rows) {
          if (seenIds.has(row.id)) continue;
          seenIds.add(row.id);

          // Filter: skip junior/intern by title
          if (EXCLUDED_TITLE_PATTERNS.test(row.title)) {
            skippedTitle++;
            continue;
          }

          // Filter: must be remote or US-based
          if (!isLocationUSOrRemote(row.location)) {
            skippedLocation++;
            continue;
          }

          const salary = parseSalary(row.salary);

          allJobs.push({
            sourceId: row.id,
            url: row.url || undefined,
            title: row.title,
            company: row.company || undefined,
            location: row.location || undefined,
            category,
            salaryMin: salary.min,
            salaryMax: salary.max,
            postedAt: row.postedAt ? new Date(row.postedAt).toISOString() : undefined,
            rawData: row as unknown as Record<string, unknown>,
          });
        }

        console.log(`[Web3Career] ${category} page ${page}: ${rows.length} fetched, ${allJobs.length} total kept`);

        // Check if there's a next page link
        if (!html.includes(`page=${page + 1}`)) break;
        await delay(DELAY_MS);
      }
    }

    console.log(`[Web3Career] Scrape complete. ${allJobs.length} jobs kept (skipped: ${skippedTitle} by title, ${skippedLocation} non-US/non-remote)`);
    return allJobs;
  }
}
