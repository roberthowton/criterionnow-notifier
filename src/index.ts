import { load } from "cheerio";
import { readFileSync, writeFileSync, existsSync } from "fs";

const STATE_FILE = "state/current.json";
const NTFY_TOPIC = process.env.NTFY_TOPIC ?? "criterion-now";

async function fetchCurrentFilm(): Promise<string> {
  const res = await fetch("https://whatsonnow.criterionchannel.com/");
  const html = await res.text();
  const $ = load(html);
  const title = $("h2.whatson__title").first().text().trim();
  if (!title) throw new Error("Could not find film title");
  return title;
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

const title = await fetchCurrentFilm();
const prev = readState();

if (prev?.title === title) {
  console.log("No change:", title);
} else {
  await notify(title);
  writeState(title);
}
