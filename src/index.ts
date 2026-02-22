import { load } from "cheerio";
import { readFileSync, writeFileSync, existsSync } from "fs";

const STATE_FILE = "state/current.json";
const NTFY_TOPIC = process.env.NTFY_TOPIC ?? "criterion-now";

const POLL_THRESHOLD_MIN = 4; // start tight polling when <= this many minutes remain
const LOOP_INTERVAL_MS = 20_000;
const LOOP_MAX_MS = 3 * 60_000;

interface PageData {
  title: string;
  remainingMin: number | null;
}

async function fetchPage(): Promise<PageData> {
  const res = await fetch("https://whatsonnow.criterionchannel.com/");
  const html = await res.text();
  const $ = load(html);
  const title = $("h2.whatson__title").first().text().trim();
  if (!title) throw new Error("Could not find film title");
  const timerText = $(".whatson__eyebrow--bold").first().text().trim();
  const remainingMin = parseMinutes(timerText);
  return { title, remainingMin };
}

function parseMinutes(text: string): number | null {
  let total = 0;
  const hours = text.match(/(\d+)\s+hour/);
  const mins = text.match(/(\d+)\s+min/);
  if (hours) total += parseInt(hours[1]) * 60;
  if (mins) total += parseInt(mins[1]);
  return hours || mins ? total : null;
}

function readState(): { title: string } | null {
  if (!existsSync(STATE_FILE)) return null;
  return JSON.parse(readFileSync(STATE_FILE, "utf8"));
}

function writeState(title: string): void {
  writeFileSync(STATE_FILE, JSON.stringify({ title }));
}

async function notify(title: string): Promise<void> {
  await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
    method: "POST",
    body: title,
    headers: { Title: "Now on Criterion Channel" },
  });
  console.log(`Notified: ${title}`);
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
  const { title } = await fetchPage();
  if (title !== prev?.title) {
    await notify(title);
    writeState(title);
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
