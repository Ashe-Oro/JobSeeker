const JOBSTASH_HOST = 'https://jobstash.xyz';

interface JobUrlParts {
  source: string;
  sourceId?: string | null;
  title?: string | null;
  url?: string | null;
}

function slugifyJobTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .toLowerCase();
}

export function buildJobStashUrl(title: string, sourceId: string): string {
  return `${JOBSTASH_HOST}/${slugifyJobTitle(title)}/${sourceId}`;
}

export function normalizeJobUrl({ source, sourceId, title, url }: JobUrlParts): string | null {
  if (source === 'jobstash' && sourceId && title) {
    return buildJobStashUrl(title, sourceId);
  }

  return url ?? null;
}
