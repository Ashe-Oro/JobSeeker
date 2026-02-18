// Shared filters for all scraper adapters

// Title patterns to exclude (junior/intern level)
export const EXCLUDED_TITLE_PATTERNS =
  /\b(intern|internship|junior|jr\.?|entry.level|graduate|trainee)\b/i;

// Non-US regions/countries — if any of these appear, the job is excluded
// even if it also says "Remote"
const NON_US_PATTERNS =
  /\b(europe|european|emea|eu\b|uk\b|united kingdom|london|berlin|paris|amsterdam|lisbon|barcelona|spain|germany|france|netherlands|portugal|ireland|switzerland|poland|warsaw|czech|austria|italy|sweden|denmark|norway|finland|belgium|romania|hungary|croatia|serbia|greece|ukraine|russia|turkey|israel|tel aviv|dubai|uae|saudi|qatar|middle east|africa|nigeria|south africa|kenya|india|bangalore|mumbai|hyderabad|delhi|pakistan|bangladesh|china|beijing|shanghai|shenzhen|hong kong|japan|tokyo|korea|south korea|singapore|philippines|vietnam|thailand|indonesia|malaysia|taiwan|apac|asia|latin america|latam|brazil|são paulo|sao paulo|mexico|argentina|colombia|chile|peru|canada|vancouver|toronto|montreal|ottawa|australia|sydney|melbourne|new zealand)\b/i;

// US cities/states/indicators — if these appear, location is valid
const US_PATTERNS =
  /\b(united states|usa|us\b|u\.s\.|new york|nyc|san francisco|los angeles|chicago|austin|miami|boston|seattle|denver|portland|atlanta|dallas|houston|philadelphia|phoenix|minneapolis|detroit|nashville|raleigh|charlotte|pittsburgh|salt lake|san diego|san jose|washington\s*d\.?c\.?|california|texas|florida|georgia|colorado|virginia|washington|oregon|north carolina|south carolina|illinois|massachusetts|pennsylvania|ohio|michigan|arizona|tennessee|maryland|minnesota|wisconsin|indiana|missouri|connecticut|iowa|utah|nevada|new jersey|new hampshire|alabama|kentucky|louisiana|oklahoma|arkansas|mississippi|hawaii|idaho|montana|nebraska|new mexico|rhode island|vermont|wyoming|maine|delaware|west virginia|south dakota|north dakota|alaska|\bca\b|\bny\b|\bnc\b|\bfl\b|\btx\b|\bwa\b|\bco\b|\bil\b|\bma\b)\b/i;

/**
 * Determines if a job location is acceptable (US-based or truly global remote).
 * Returns true for:
 *   - No location specified (include by default)
 *   - "Remote" with no non-US region qualifier
 *   - Locations mentioning US cities/states
 *   - "Global", "Worldwide", "Anywhere" with no non-US restriction
 * Returns false for:
 *   - Locations mentioning non-US countries/regions
 *   - "Remote" qualified with non-US regions (e.g. "Remote - Europe")
 */
export function isLocationUSOrRemote(location: string | undefined | null, locationType?: string | null): boolean {
  // Remote type with no location string — assume global remote, allow it
  if (locationType === 'REMOTE' && !location) return true;

  // No location info at all — include by default
  if (!location) return true;

  const loc = location.trim();
  if (!loc) return true;

  // Explicitly excludes US — reject
  if (/outside\s*(of\s*)?(the\s*)?us/i.test(loc)) return false;

  // If it explicitly mentions a non-US region, reject it —
  // even if it also says "Remote"
  if (NON_US_PATTERNS.test(loc)) {
    // Exception: if it ALSO mentions a US location, keep it
    // e.g. "New York, NY / Remote, London" — has US presence
    if (US_PATTERNS.test(loc)) return true;
    return false;
  }

  // If it mentions a US location, accept
  if (US_PATTERNS.test(loc)) return true;

  // Pure remote/global/anywhere/worldwide with no region qualifier — accept
  if (/\b(remote|global|worldwide|anywhere)\b/i.test(loc)) return true;

  // "North America" without a non-US qualifier — accept
  if (/\bnorth america\b/i.test(loc)) return true;

  // Unknown location string with no recognizable region — include by default
  return true;
}
