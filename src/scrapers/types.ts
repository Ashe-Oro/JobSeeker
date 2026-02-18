export interface RawJob {
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
}

export interface ScraperAdapter {
  name: string;
  scrape(): Promise<RawJob[]>;
}
