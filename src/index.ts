import { load } from "cheerio";
import { readFileSync, writeFileSync, existsSync } from "fs";

const STATE_FILE = "state/current.json";
const NTFY_TOPIC = process.env.NTFY_TOPIC ?? "criterion-now";

const POLL_THRESHOLD_MIN = 4; // start tight polling when <= this many minutes remain
const LOOP_INTERVAL_MS = 20_000;
const LOOP_MAX_MS = 3 * 60_000;

const UPCOMING_COUNT = 5; // films listed under "Up next" in the notification
const SCHEDULE_TZ = process.env.SCHEDULE_TZ ?? "America/New_York";

interface PageData {
  title: string;
  remainingMin: number | null;
  upcoming: ScheduleEntry[];
}

// whatsonnow.criterionchannel.com now redirects here (site redesign, Sep 2026)
const LIVE_URL = "https://www.criterionchannel.com/live/1emmgvqX/criterion-24-7";

interface ScheduleEntry {
  title: string;
  start: number;
  end: number;
}

async function fetchPage(): Promise<PageData> {
  const res = await fetch(LIVE_URL);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  const html = await res.text();

  const now = Date.now();
  const schedule = parseSchedule(html);
  const current = schedule.find((e) => e.start <= now && now < e.end);
  if (current) {
    return {
      title: current.title,
      remainingMin: Math.ceil((current.end - now) / 60_000),
      upcoming: schedule.filter((e) => e.start >= current.end).slice(0, UPCOMING_COUNT),
    };
  }

  // Fallback: the rendered hero title (no timing info available)
  const $ = load(html);
  const title = $('main h1[class*="__title"]').first().text().trim();
  if (!title) throw new Error("Could not find film title");
  return { title, remainingMin: null, upcoming: [] };
}

// The schedule lives in the Next.js RSC payload: self.__next_f.push([1,"<json-escaped string>"])
function parseSchedule(html: string): ScheduleEntry[] {
  const payload = [...html.matchAll(/self\.__next_f\.push\((\[1,"(?:[^"\\]|\\.)*"\])\)/g)]
    .map((m) => (JSON.parse(m[1]) as [number, string])[1])
    .join("");
  const entries = new Map<string, ScheduleEntry>();
  const re = /\{"startTime":"([^"]+)","endTime":"([^"]+)","episodeTitle":("(?:[^"\\]|\\.)*")/g;
  for (const m of payload.matchAll(re)) {
    const start = Date.parse(m[1]);
    const end = Date.parse(m[2]);
    if (isNaN(start) || isNaN(end)) continue;
    entries.set(m[1], { title: JSON.parse(m[3]), start, end });
  }
  return [...entries.values()].sort((a, b) => a.start - b.start);
}

interface State {
  title: string;
  remainingMin: number | null;
}

function readState(): State | null {
  if (!existsSync(STATE_FILE)) return null;
  return JSON.parse(readFileSync(STATE_FILE, "utf8"));
}

function writeState(data: PageData): void {
  const state: State = { title: data.title, remainingMin: data.remainingMin };
  writeFileSync(STATE_FILE, JSON.stringify(state));
}

const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: SCHEDULE_TZ,
  hour: "numeric",
  minute: "2-digit",
});

function formatBody(data: PageData): string {
  let now = data.title;
  if (data.remainingMin !== null) {
    const h = Math.floor(data.remainingMin / 60);
    const m = data.remainingMin % 60;
    const duration = h > 0 ? `${h}h ${m}m` : `${m}m`;
    now += ` (${duration} remaining)`;
  }
  if (data.upcoming.length === 0) return now;
  const next = data.upcoming.map((e) => `${timeFmt.format(e.start)}  ${e.title}`);
  return [now, "", "Up next:", ...next].join("\n");
}

async function notify(data: PageData): Promise<void> {
  const body = formatBody(data);
  await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
    method: "POST",
    body,
    headers: { Title: "Now on Criterion Channel" },
  });
  console.log(`Notified: ${body}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const prev = readState();
const { remainingMin } = await fetchPage();

if (remainingMin !== null && remainingMin > POLL_THRESHOLD_MIN) {
  console.log(`${remainingMin} min remaining — skipping`);
  process.exit(0);
}

console.log(`${remainingMin ?? "?"} min remaining — polling`);

async function checkAndNotify(): Promise<boolean> {
  const data = await fetchPage();
  if (data.title !== prev?.title) {
    await notify(data);
    writeState(data);
    return true;
  }
  return false;
}

if (await checkAndNotify()) process.exit(0);

const deadline = Date.now() + LOOP_MAX_MS;
while (Date.now() < deadline) {
  await sleep(LOOP_INTERVAL_MS);
  if (await checkAndNotify()) process.exit(0);
}

console.log("No change detected within polling window");
