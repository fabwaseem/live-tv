/**
 * World channel catalogue.
 *
 * Backbone: the iptv-org public API (streams/channels/categories/countries/logos).
 * Second source: the Free-TV/IPTV community playlist (M3U), merged in and
 * deduped by stream URL — iptv-org metadata always wins. NSFW-flagged
 * channels from the backbone metadata are excluded entirely.
 * FAST sources (round 3): the BuddyChewChew/app-m3u-generator playlists —
 * daily-regenerated M3U exports of the free ad-supported platforms (Samsung
 * TV Plus, Pluto TV, The Roku Channel, Tubi), built from the services' own
 * public channel data. Pluto/Samsung stream links go through jmp2.uk, the
 * ecosystem's canonical stable-link resolver — the same link family the
 * iptv-org backbone itself ships for these platforms. Plex is deliberately
 * NOT merged: its generated URLs embed an X-Plex-Token credential.
 * Regional source (round 3): Alplox/json-teles per-country M3U files — a
 * maintained, community-curated directory of Latin American / Spanish and
 * other local channels, merged per country file so the country is exact.
 * Entries whose URL carries a token parameter are dropped from every
 * community source.
 *
 * The joined payload is built once and memoized in module scope for
 * REVALIDATE_SECONDS; upstream files are several MB each, so nothing here
 * is fetched per request.
 */

export interface ChannelStream {
  name: string;
  logo: string | null;
  /** ISO country code, or "UN" when the origin is unknown. */
  country: string;
  countryName: string;
  /** Category display names; never empty ("Other" fallback). */
  categories: string[];
  url: string;
  channelId: string;
  /** Upstream-required User-Agent, when iptv-org records one. Omitted otherwise. */
  ua?: string;
  /** Upstream-required Referer, when iptv-org records one. Omitted otherwise. */
  ref?: string;
}

export interface CountrySummary {
  code: string;
  name: string;
  flag: string;
  count: number;
}

export interface WorldPayload {
  streams: ChannelStream[];
  totals: { streams: number; channels: number; countries: number };
  sources: { iptvOrg: number; freeTv: number; fast: number; alplox: number };
  countries: CountrySummary[];
  generatedAt: string;
}

/* ---------------------------------- raw upstream shapes ---------------------------------- */

interface RawStream {
  channel: string | null;
  feed: string | null;
  title: string | null;
  url: string;
  user_agent: string | null;
  referrer: string | null;
}

interface RawChannel {
  id: string;
  name: string;
  country: string;
  categories: string[] | null;
  is_nsfw: boolean;
}

interface RawCategory {
  id: string;
  name: string;
}

interface RawCountry {
  name: string;
  code: string;
  flag: string;
}

interface RawLogo {
  channel: string;
  feed: string | null;
  in_use: boolean;
  width: number | null;
  height: number | null;
  url: string;
}

const API = "https://iptv-org.github.io/api";
const FREETV_URL =
  "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8";
/* FAST exports (BuddyChewChew/app-m3u-generator, regenerated daily by its
   GitHub Actions from the platforms' public channel data). */
const FAST_BASE =
  "https://raw.githubusercontent.com/BuddyChewChew/app-m3u-generator/main/playlists";
const FAST_URLS = {
  samsung: `${FAST_BASE}/samsungtvplus_all.m3u`,
  pluto: `${FAST_BASE}/plutotv_all.m3u`,
  roku: `${FAST_BASE}/roku_all.m3u`,
  tubi: `${FAST_BASE}/tubi_all.m3u`,
} as const;
/* Alplox/json-teles per-country files; the filename IS the country code
   ("gb-eng" is the English GB file and files under GB). */
const ALPLOX_COUNTRIES = [
  "ae", "ar", "cl", "co", "de", "ec", "es", "gb", "gb-eng", "hn",
  "in", "iq", "lb", "mx", "pe", "pk", "qa", "sa", "us", "ve",
];
const alploxUrl = (file: string) =>
  `https://raw.githubusercontent.com/Alplox/json-teles/main/m3u-playlists/${file}.m3u`;
const REVALIDATE_MS = 3600_000; // 1 hour
const UNKNOWN = "UN";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "user-agent": "live-tv/1.0 (+iptv-org-api)" },
  });
  if (!res.ok) throw new Error(`Upstream fetch failed ${res.status}: ${url}`);
  return (await res.json()) as T;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": "live-tv/1.0 (+iptv-org-api)" },
  });
  if (!res.ok) throw new Error(`Upstream fetch failed ${res.status}: ${url}`);
  return res.text();
}

function hashString(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/* ---------------------------------- M3U parsing (Free-TV) ---------------------------------- */

interface M3uEntry {
  attrs: Record<string, string>;
  name: string;
  url: string;
  ua?: string;
  ref?: string;
}

function extinfName(line: string): string {
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === "," && !inQuotes) return line.slice(i + 1).trim();
  }
  return "";
}

function parseM3u(text: string): M3uEntry[] {
  const lines = text.split(/\r?\n/);
  const entries: M3uEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("#EXTINF")) continue;
    const attrs: Record<string, string> = {};
    for (const m of line.matchAll(/([a-zA-Z0-9-]+)="([^"]*)"/g)) attrs[m[1]] = m[2];
    let url = "";
    let ua: string | undefined;
    let ref: string | undefined;
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j].trim();
      if (!next) continue;
      if (next.startsWith("#")) {
        // #EXTVLCOPT:http-user-agent=… / http-referrer=… belong to this entry.
        const opt = next.match(/^#EXTVLCOPT:http-(user-agent|referrer)=(.+)$/i);
        if (opt) {
          if (opt[1].toLowerCase() === "user-agent") ua = opt[2].trim();
          else ref = opt[2].trim();
        }
        continue;
      }
      url = next;
      i = j;
      break;
    }
    if (url) entries.push({ attrs, name: extinfName(line), url, ua, ref });
  }
  return entries;
}

/** Free-TV decorates some names with trailing Ⓢ/Ⓣ markers — strip them. */
function cleanFreeTvName(name: string): string {
  return name.replace(/[\sⓈⓉⓥ]+$/u, "").trim();
}

/* ------------------------- community-source helpers -------------------------
   The FAST exports carry no genre for Samsung/Pluto (their group-title is a
   country name) and free-form genre labels for Roku/Tubi. Everything is
   normalized into the app's existing category vocabulary — exact group
   labels first, then multilingual keyword rules over group and name. */

const GROUP_CATEGORY: Record<string, string> = {
  // The Roku Channel group labels
  "3x3 basketball": "Sports", animals: "Documentary", animated: "Animation",
  anime: "Animation", art: "Culture", auction: "Shop",
  "auto & motorsports": "Auto", bowling: "Sports", "card games": "Entertainment",
  "children-music": "Kids", comedy: "Comedy", cooking: "Cooking",
  crime: "Documentary", "crime drama": "Series", documentary: "Documentary",
  educational: "Education", environment: "Documentary",
  "faith & family": "Family", "game show": "Entertainment",
  "gaming & tech": "Entertainment", health: "Lifestyle",
  "home improvement": "Lifestyle", "house/garden": "Lifestyle",
  law: "Documentary", movies: "Movies", music: "Music", news: "News",
  other: "Other", paranormal: "Entertainment", "pro wrestling": "Sports",
  romance: "Series", shopping: "Shop", sports: "Sports",
  "tv & entertainment": "Entertainment", weather: "Weather",
  // Tubi group labels
  "black entertainment": "Entertainment", "business news": "Business",
  "classic tv": "Classic", documentaries: "Documentary",
  español: "Entertainment", "games & competition": "Entertainment",
  "global news": "News", "good eats": "Cooking", horror: "Movies",
  "kids & family": "Kids", lifestyle: "Lifestyle", "local news": "News",
  "movie channels": "Movies", mystery: "Series", "national news": "News",
  "pop culture": "Entertainment", reality: "Entertainment",
  "sci-fi & supernatural": "Series", "science & nature": "Science",
  "sports on now": "Sports", "tv dramas": "Series", "true crime": "Documentary",
};

const CATEGORY_KEYWORDS: [RegExp, string][] = [
  [/bloomberg|business|financ|econom|money|börse|bolsa/, "Business"],
  [/weather|wetter|clima|meteo|tempo/, "Weather"],
  [/sport|fifa|football|soccer|fútbol|futebol|nfl|nba|mlb|nhl|tennis|golf|racing|motorsport|formula 1|fight|boxing|mma|ufc|wrestl|lucha|deporte|esporte/, "Sports"],
  [/kids|niños|ninos|kinder|enfants|bambini|crianças|junior|baby tv/, "Kids"],
  [/anime|cartoon|animation|animación|desenhos/, "Animation"],
  [/music|música|musica|musik|mtv|vevo|concert|radio|hits/, "Music"],
  [/comedy|comedia|comédia|humor|funny|stand.?up/, "Comedy"],
  [/cooking|food|chef|cocina|cozinha|gourmet|kitchen|grill|bake/, "Cooking"],
  [/travel|viaje|viagem|voyage|reise|tourism|turismo/, "Travel"],
  [/classic|clásico|classico|retro|vintage|oldies|nostalg/, "Classic"],
  [/gospel|faith|church|iglesia|igreja|bibl|god tv|ewtn|religio/, "Religious"],
  [/documentary|documental|discovery|history|historia|nature|naturaleza|science|ciencia|planeta|true crime|investigat/, "Documentary"],
  [/movie|film|cinema|cine|kino|película|filme|thriller|western|horror|terror/, "Movies"],
  [/series|drama|novela|soap|série|serien|dizi/, "Series"],
  [/education|educación|learning|aprend|escuela/, "Education"],
  [/shop|shopping|qvc|tienda/, "Shop"],
  [/news|noticias|nachrichten|notizie|nyheter|actualit/, "News"],
  [/lifestyle|reality|fashion|moda|hogar|health|salud|beauty|estilo|home/, "Lifestyle"],
];

function mappedCategory(group: string, name: string): string {
  const g = group.trim().toLowerCase();
  if (GROUP_CATEGORY[g]) return GROUP_CATEGORY[g];
  for (const [re, cat] of CATEGORY_KEYWORDS) if (re.test(g)) return cat;
  const n = name.toLowerCase();
  for (const [re, cat] of CATEGORY_KEYWORDS) if (re.test(n)) return cat;
  return "Entertainment";
}

/** Credential-carrying URLs never enter the catalogue from community lists. */
const CREDENTIAL_URL = /[?&][^=&#]*token=|x-plex-token|get\.php/i;
function isCleanUrl(url: string): boolean {
  return !CREDENTIAL_URL.test(url);
}

/* ---------------------------------- payload builder ---------------------------------- */

async function buildPayload(): Promise<WorldPayload> {
  const [
    streamsRaw, channelsRaw, categoriesRaw, countriesRaw, logosRaw, freeTvText,
    samsungText, plutoText, rokuText, tubiText, alploxTexts,
  ] =
    await Promise.all([
      fetchJson<RawStream[]>(`${API}/streams.json`),
      fetchJson<RawChannel[]>(`${API}/channels.json`),
      fetchJson<RawCategory[]>(`${API}/categories.json`),
      fetchJson<RawCountry[]>(`${API}/countries.json`),
      fetchJson<RawLogo[]>(`${API}/logos.json`),
      fetchText(FREETV_URL).catch(() => null), // source #2 must never sink the build
      // FAST + regional sources: same rule — a dead list never sinks the build.
      fetchText(FAST_URLS.samsung).catch(() => null),
      fetchText(FAST_URLS.pluto).catch(() => null),
      fetchText(FAST_URLS.roku).catch(() => null),
      fetchText(FAST_URLS.tubi).catch(() => null),
      Promise.all(ALPLOX_COUNTRIES.map((c) => fetchText(alploxUrl(c)).catch(() => null))),
    ]);

  const categoryName = new Map(categoriesRaw.map((c) => [c.id, c.name]));
  const countryInfo = new Map(countriesRaw.map((c) => [c.code, c]));
  const channelById = new Map(channelsRaw.map((c) => [c.id, c]));
  // FAST group-titles are country NAMES ("United States", "South Korea"…).
  const countryCodeByName = new Map(countriesRaw.map((c) => [c.name.toLowerCase(), c.code]));
  countryCodeByName.set("uk", "GB");
  countryCodeByName.set("usa", "US");
  countryCodeByName.set("korea", "KR");

  // Best logo per channel, and per channel+feed (feed match wins at lookup time).
  const logoScore = (l: RawLogo) => (l.in_use ? 1e12 : 0) + (l.width ?? 0) * (l.height ?? 0);
  const logoByChannel = new Map<string, RawLogo>();
  const logoByFeed = new Map<string, RawLogo>();
  for (const logo of logosRaw) {
    if (!logo.url) continue;
    const cur = logoByChannel.get(logo.channel);
    if (!cur || logoScore(logo) > logoScore(cur)) logoByChannel.set(logo.channel, logo);
    if (logo.feed) {
      const key = `${logo.channel}|${logo.feed}`;
      const curFeed = logoByFeed.get(key);
      if (!curFeed || logoScore(logo) > logoScore(curFeed)) logoByFeed.set(key, logo);
    }
  }
  const logoFor = (channelId: string | null, feed: string | null): string | null => {
    if (!channelId) return null;
    if (feed) {
      const byFeed = logoByFeed.get(`${channelId}|${feed}`);
      if (byFeed) return byFeed.url;
    }
    return logoByChannel.get(channelId)?.url ?? null;
  };

  const seenUrls = new Set<string>();
  const out: ChannelStream[] = [];

  /* ---- backbone: iptv-org ---- */
  let iptvOrgCount = 0;
  for (const raw of streamsRaw) {
    const url = (raw.url ?? "").trim();
    if (!url || seenUrls.has(url)) continue;
    const channel = raw.channel ? channelById.get(raw.channel) : undefined;
    if (channel?.is_nsfw) continue; // excluded entirely (URL not marked seen on purpose: an SFW twin may still exist)
    seenUrls.add(url);

    const country = channel?.country ?? UNKNOWN;
    const categories = (channel?.categories ?? [])
      .map((id) => categoryName.get(id))
      .filter((n): n is string => Boolean(n));

    const stream: ChannelStream = {
      name: channel?.name ?? (raw.title?.trim() || "Unknown channel"),
      logo: logoFor(raw.channel, raw.feed),
      country,
      countryName: countryInfo.get(country)?.name ?? "Unknown",
      categories: categories.length > 0 ? categories : ["Other"],
      url,
      channelId: raw.channel ?? `stream-${hashString(url)}`,
    };
    // Keep the payload lean: only attach playback hints when upstream recorded them.
    const ua = raw.user_agent?.trim();
    if (ua) stream.ua = ua;
    const ref = raw.referrer?.trim();
    if (ref) stream.ref = ref;
    out.push(stream);
    iptvOrgCount++;
  }

  /* ---- second source: Free-TV/IPTV playlist ---- */
  let freeTvCount = 0;
  if (freeTvText) {
    for (const entry of parseM3u(freeTvText)) {
      const url = entry.url.trim();
      if (!url || seenUrls.has(url)) continue;
      seenUrls.add(url);

      const tvgId = entry.attrs["tvg-id"] || "";
      let country = (entry.attrs["tvg-country"] || "").toUpperCase();
      if (!countryInfo.has(country)) {
        const suffix = tvgId.split(".").pop()?.toUpperCase() ?? "";
        country = countryInfo.has(suffix) ? suffix : UNKNOWN;
      }
      const name = cleanFreeTvName(entry.name) || entry.attrs["tvg-name"] || "Unknown channel";

      const stream: ChannelStream = {
        name,
        logo: entry.attrs["tvg-logo"] ? entry.attrs["tvg-logo"] : logoFor(tvgId || null, null),
        country,
        countryName: countryInfo.get(country)?.name ?? "Unknown",
        categories: ["Other"], // Free-TV's group-title is a country, not a category
        url,
        channelId: tvgId || `freetv-${hashString(url)}`,
      };
      if (entry.ua) stream.ua = entry.ua;
      if (entry.ref) stream.ref = entry.ref;
      out.push(stream);
      freeTvCount++;
    }
  }

  /* ---- FAST sources: Samsung TV Plus / Pluto TV / Roku / Tubi ----
     Same merge contract (EXTINF parse, exact-URL dedupe, earlier sources
     win, credential-carrying URLs dropped). Samsung/Pluto group-titles are
     country names and their channel-ids carry a region suffix, so each
     regional instance stays its own channel; Roku/Tubi group-titles are
     genres and their lineups are the US ones (per the generator), so the
     country is US. Channel ids are source-prefixed — tvg-ids collide
     across platforms (and Plex-style hex ids would collide with nothing
     so much as each other). */
  let fastCount = 0;
  const fastSources: {
    text: string | null;
    prefix: string;
    countryMode: "group" | "US";
    genreFromGroup: boolean;
  }[] = [
    { text: samsungText, prefix: "samsung", countryMode: "group", genreFromGroup: false },
    { text: plutoText, prefix: "pluto", countryMode: "group", genreFromGroup: false },
    { text: rokuText, prefix: "roku", countryMode: "US", genreFromGroup: true },
    { text: tubiText, prefix: "tubi", countryMode: "US", genreFromGroup: true },
  ];
  for (const src of fastSources) {
    if (!src.text) continue;
    for (const entry of parseM3u(src.text)) {
      const url = entry.url.trim();
      if (!url || seenUrls.has(url) || !isCleanUrl(url)) continue;
      seenUrls.add(url);

      const group = entry.attrs["group-title"] || "";
      const country =
        src.countryMode === "US"
          ? "US"
          : (countryCodeByName.get(group.trim().toLowerCase()) ?? UNKNOWN);
      const name =
        entry.name && !entry.name.includes('"')
          ? entry.name
          : entry.attrs["tvg-name"] || entry.name || "Unknown channel";
      const rawId = entry.attrs["channel-id"] || entry.attrs["tvg-id"] || "";

      const stream: ChannelStream = {
        name,
        logo: entry.attrs["tvg-logo"] ? entry.attrs["tvg-logo"] : null,
        country,
        countryName: countryInfo.get(country)?.name ?? "Unknown",
        categories: [mappedCategory(src.genreFromGroup ? group : "", name)],
        url,
        channelId: rawId ? `${src.prefix}-${rawId}` : `${src.prefix}-${hashString(url)}`,
      };
      if (entry.ua) stream.ua = entry.ua;
      if (entry.ref) stream.ref = entry.ref;
      out.push(stream);
      fastCount++;
    }
  }

  /* ---- regional source: Alplox/json-teles per-country files ----
     The filename is the country; group-titles are iptv-org category ids, so
     the backbone's own id→name map labels them. Display names carry a
     trailing "[CL]"-style tag (the tvg-name attribute is the clean name);
     the lists carry no tvg-id, so each signal anchors its own channel. */
  let alploxCount = 0;
  for (let i = 0; i < ALPLOX_COUNTRIES.length; i++) {
    const text = alploxTexts[i];
    if (!text) continue;
    const fileCode = ALPLOX_COUNTRIES[i];
    const country = fileCode === "gb-eng" ? "GB" : fileCode.toUpperCase();
    for (const entry of parseM3u(text)) {
      const url = entry.url.trim();
      if (!url || seenUrls.has(url) || !isCleanUrl(url)) continue;
      seenUrls.add(url);

      const groupId = (entry.attrs["group-title"] || "").trim().toLowerCase();
      const name =
        entry.attrs["tvg-name"] ||
        entry.name.replace(/\s*\[[A-Z]{2}\]$/u, "").trim() ||
        "Unknown channel";

      const stream: ChannelStream = {
        name,
        logo: entry.attrs["tvg-logo"] ? entry.attrs["tvg-logo"] : null,
        country: countryInfo.has(country) ? country : UNKNOWN,
        countryName: countryInfo.get(country)?.name ?? "Unknown",
        categories: [categoryName.get(groupId) ?? "General"],
        url,
        channelId: `alplox-${hashString(url)}`,
      };
      if (entry.ua) stream.ua = entry.ua;
      if (entry.ref) stream.ref = entry.ref;
      out.push(stream);
      alploxCount++;
    }
  }

  out.sort(
    (a, b) =>
      a.countryName.localeCompare(b.countryName) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

  /* ---- aggregates ---- */
  const counts = new Map<string, number>();
  for (const s of out) counts.set(s.country, (counts.get(s.country) ?? 0) + 1);
  const countries: CountrySummary[] = [...counts.entries()]
    .map(([code, count]) => ({
      code,
      name: code === UNKNOWN ? "Unknown" : (countryInfo.get(code)?.name ?? code),
      flag: code === UNKNOWN ? "🌐" : (countryInfo.get(code)?.flag ?? "🏳️"),
      count,
    }))
    .sort((a, b) => {
      if (a.code === UNKNOWN) return 1;
      if (b.code === UNKNOWN) return -1;
      return b.count - a.count || a.name.localeCompare(b.name);
    });

  return {
    streams: out,
    totals: {
      streams: out.length,
      channels: new Set(out.map((s) => s.channelId)).size,
      countries: [...counts.keys()].filter((c) => c !== UNKNOWN).length,
    },
    sources: { iptvOrg: iptvOrgCount, freeTv: freeTvCount, fast: fastCount, alplox: alploxCount },
    countries,
    generatedAt: new Date().toISOString(),
  };
}

/* ---------------------------------- memoized accessor ---------------------------------- */

let memo: { builtAt: number; promise: Promise<WorldPayload> } | null = null;

export function getWorldPayload(): Promise<WorldPayload> {
  if (memo && Date.now() - memo.builtAt < REVALIDATE_MS) return memo.promise;
  const promise = buildPayload();
  memo = { builtAt: Date.now(), promise };
  // A failed build must not poison the cache — drop it so the next request retries.
  promise.catch(() => {
    if (memo?.promise === promise) memo = null;
  });
  return promise;
}

/* ------------------------- per-URL lookup (stream proxy) -------------------------
   The proxy only serves URLs that exist in this catalogue. The index is
   built lazily per payload generation and dropped when the payload rolls. */

let lookupCache: { payload: WorldPayload; byUrl: Map<string, ChannelStream> } | null = null;

export async function getStreamByUrl(url: string): Promise<ChannelStream | undefined> {
  const payload = await getWorldPayload();
  if (!lookupCache || lookupCache.payload !== payload) {
    lookupCache = {
      payload,
      byUrl: new Map(payload.streams.map((s) => [s.url, s])),
    };
  }
  return lookupCache.byUrl.get(url);
}
