/**
 * Copies the flag SVG for every country in the perimeter into public/flags/,
 * keyed by ISO3 — flag-icons names its files by iso2, but the client only ever
 * receives `revealIso3`, so renaming here saves shipping an iso3->iso2 map to the
 * browser just to build an <img> src. Run once and commit the output — same arrangement as
 * public/geo/'s topology files: `flag-icons` is a devDependency, the app never
 * imports it, and nothing is fetched from a CDN at runtime (CLAUDE.md forbids
 * both bitmap map images and external asset hosts).
 *
 * SVG, not emoji: at the size a quiz renders, 🇹🇩 Chad and 🇷🇴 Romania are
 * near-identical, as are 🇮🇩 Indonesia and 🇲🇨 Monaco, and 🇹🇼 Taiwan is hidden
 * outright on some platforms. A flag question needs the actual flag.
 *
 * Run: pnpm tsx scripts/build-flags.ts
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const SRC = path.join(repoRoot, "node_modules/flag-icons/flags/4x3");
const DEST = path.join(repoRoot, "public/flags");

interface CountryRecord {
  iso3: string;
  iso2: string;
  name_fr: string;
}

function main() {
  const countries = [
    ...(JSON.parse(
      readFileSync(path.join(repoRoot, "scripts/data/countries.fr.json"), "utf-8"),
    ) as CountryRecord[]),
    ...(JSON.parse(
      readFileSync(path.join(repoRoot, "scripts/data/countries.extra.fr.json"), "utf-8"),
    ) as CountryRecord[]),
  ];

  if (!existsSync(SRC)) {
    console.error(`Missing ${SRC} — run pnpm install first (flag-icons is a devDependency).`);
    process.exit(1);
  }
  mkdirSync(DEST, { recursive: true });

  let copied = 0;
  let bytes = 0;
  const missing: string[] = [];

  for (const c of countries) {
    const src = path.join(SRC, `${c.iso2.toLowerCase()}.svg`);
    if (!existsSync(src)) {
      missing.push(`${c.iso3}/${c.iso2} ${c.name_fr}`);
      continue;
    }
    const svg = readFileSync(src);
    writeFileSync(path.join(DEST, `${c.iso3}.svg`), svg);
    copied += 1;
    bytes += svg.byteLength;
  }

  const biggest = countries
    .map((c) => {
      const p = path.join(DEST, `${c.iso3}.svg`);
      return existsSync(p) ? { iso: c.iso3, kb: Math.round(statSync(p).size / 1024) } : null;
    })
    .filter((x): x is { iso: string; kb: number } => x !== null)
    .sort((a, b) => b.kb - a.kb)
    .slice(0, 5);

  console.log(
    JSON.stringify({
      event: "build_flags_complete",
      copied,
      total_kb: Math.round(bytes / 1024),
      missing: missing.length,
    }),
  );
  console.log(`[info] largest: ${biggest.map((b) => `${b.iso} ${b.kb}kB`).join(", ")}`);
  if (missing.length > 0) {
    console.log(`[warn] no flag asset for:`);
    for (const m of missing) console.log(`         ${m}`);
  }
}

main();
