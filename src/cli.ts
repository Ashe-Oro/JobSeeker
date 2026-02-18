import dotenv from 'dotenv';
dotenv.config();

import { runScraper, runAllScrapers } from './scrapers/runner';
import { scoreUnscored } from './scorer/scorer';
import { getJobStats } from './db';

const [command, arg] = process.argv.slice(2);

async function main() {
  switch (command) {
    case 'scrape': {
      const source = arg || 'all';
      if (source === 'all') {
        const results = await runAllScrapers();
        console.log('\nResults:', JSON.stringify(results, null, 2));
      } else {
        const result = await runScraper(source);
        console.log('\nResult:', JSON.stringify(result, null, 2));
      }
      break;
    }

    case 'score': {
      const limit = arg ? parseInt(arg, 10) : 50;
      const scored = await scoreUnscored(limit);
      console.log(`\nScored ${scored} jobs.`);
      break;
    }

    case 'stats': {
      const stats = getJobStats();
      console.log('\nStats:', JSON.stringify(stats, null, 2));
      break;
    }

    default:
      console.log(`
Usage:
  tsx src/cli.ts scrape [source]   Scrape jobs (jobstash, safary, web3career, cryptojobslist, or all)
  tsx src/cli.ts score [limit]     Score unscored jobs (default: 50)
  tsx src/cli.ts stats             Show job stats
      `);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
