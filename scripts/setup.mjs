// Installs GitDiagram's open-source (MIT) video engine and layout compiler into vendor/,
// pinned to one commit, and patches out the GitDiagram watermark (made configurable via
// project.json → brand). Nothing here is committed: vendor/ is git-ignored.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { COMPILER, ENGINE, ROOT, VENDOR, die, run } from "./lib/project.mjs";

export const UPSTREAM = "https://github.com/ahmedkhaleel2004/gitdiagram.git";
// Bump deliberately (then re-run setup and check the patches still apply).
export const PINNED = "10c0ff8cd5a0c0794593734454f7a6100d24a065";

const SPARSE = [
  "LICENSE",
  "public/video-engine",
  "src/features/explainer/types.ts",
  "src/server/explainer/layout.ts",
  "src/server/explainer/shots.ts",
  "src/server/explainer/text.ts",
  "src/server/explainer/script.ts",
];

// A neutral repo glyph (an open book), used where GitDiagram drew its logo.
export const REPO_GLYPH =
  '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#7a2be0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>';

/** [file, find (string or RegExp), replace]. Every anchor must match or setup fails. */
const PATCHES = [
  // The engine reads the glyph once; let window.BRAND override it.
  ["shots.js", "var GLYPH = K.GLYPH;", "var BR = window.BRAND || {}; var GLYPH = BR.glyphHtml != null ? BR.glyphHtml : K.GLYPH;"],
  // Top-left pill: "GitDiagram | owner/repo" → optional "owner/repo" (or custom text).
  [
    "shots.js",
    /label\.innerHTML = GLYPH \+[\s\S]*?esc\(M\.owner \+ "\/" \+ M\.repo\) \+ "<\/span>";/,
    'label.innerHTML = GLYPH + \'<span class="mono" style="font:600 22px/1 \\\'Geist Mono\\\';color:var(--ink)">\' + esc(BR.chipText || (M.owner + "/" + M.repo)) + "</span>";\n  if (BR.chip === false) label.style.display = "none";',
  ],
  // End card (landscape): drop "· made with GitDiagram", allow a custom link + sign-off.
  [
    "shots.js",
    `">github.com/' + esc(M.owner + "/" + M.repo) + '</span><span style="font:400 24px/1 Geist;color:var(--ink-2);margin-left:6px">· made with GitDiagram</span>'`,
    `">' + esc(BR.endLink || ("github.com/" + M.owner + "/" + M.repo)) + '</span>' + (BR.signoff ? '<span style="font:400 24px/1 Geist;color:var(--ink-2);margin-left:6px">· ' + esc(BR.signoff) + '</span>' : '')`,
  ],
  // End card (vertical feed cut).
  ["shots.js", "gitdiagram.com/' + esc(M.owner + \"/\" + M.repo)", "' + esc(BR.endLink || (\"github.com/\" + M.owner + \"/\" + M.repo))"],
  // stage.js vertical chrome.
  ["stage.js", /"gitdiagram\.com\/" \+ \(meta\.owner \|\| ""\) \+ "\/" \+ \(meta\.repo \|\| ""\)/g, '((window.BRAND || {}).endLink || ("github.com/" + (meta.owner || "") + "/" + (meta.repo || "")))'],
  ["stage.js", /\.innerHTML = GLYPH;/g, ".innerHTML = ((window.BRAND || {}).glyphHtml != null ? window.BRAND.glyphHtml : GLYPH);"],
  ["stage.html", "GitDiagram explainer stage", "Explainer stage"],
];

function applyPatches() {
  for (const [file, find, replace] of PATCHES) {
    const path = join(ENGINE, file);
    const src = readFileSync(path, "utf8");
    const hit = typeof find === "string" ? src.includes(find) : (find.lastIndex = 0, find.test(src));
    if (!hit) die(`Patch anchor not found in engine/${file}: ${String(find).slice(0, 90)}\nUpstream changed — update PATCHES in scripts/setup.mjs.`);
    if (typeof find !== "string") find.lastIndex = 0;
    writeFileSync(path, typeof find === "string" ? src.split(find).join(replace) : src.replace(find, replace));
  }
  const left = ["shots.js", "stage.js"].flatMap((f) =>
    readFileSync(join(ENGINE, f), "utf8").match(/made with GitDiagram|gitdiagram\.com/g) || [],
  );
  if (left.length) die(`Watermark text still present after patching: ${left.join(", ")}`);
}

export async function setup({ force = false } = {}) {
  if (existsSync(join(ENGINE, "stage.html")) && !force) {
    console.log("vendor/ already installed (use --force to reinstall).");
    return;
  }
  const tmp = join(VENDOR, ".upstream");
  rmSync(VENDOR, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  console.log(`Fetching GitDiagram engine @ ${PINNED.slice(0, 10)} …`);
  await run("git", ["init", "-q"], { cwd: tmp });
  await run("git", ["remote", "add", "origin", UPSTREAM], { cwd: tmp });
  await run("git", ["sparse-checkout", "set", "--no-cone", ...SPARSE], { cwd: tmp });
  await run("git", ["fetch", "-q", "--depth", "1", "--filter=blob:none", "origin", PINNED], { cwd: tmp });
  await run("git", ["checkout", "-q", "FETCH_HEAD"], { cwd: tmp });

  cpSync(join(tmp, "public/video-engine"), ENGINE, { recursive: true });
  cpSync(join(tmp, "LICENSE"), join(VENDOR, "LICENSE-gitdiagram"));
  mkdirSync(COMPILER, { recursive: true });
  cpSync(join(tmp, "src/features/explainer/types.ts"), join(COMPILER, "types.ts"));
  for (const f of ["layout", "shots", "text", "script"]) cpSync(join(tmp, `src/server/explainer/${f}.ts`), join(COMPILER, `${f}.ts`));
  for (const f of readdirSync(COMPILER)) {
    const p = join(COMPILER, f);
    writeFileSync(p, readFileSync(p, "utf8").replaceAll("~/features/explainer/types", "./types").replace(/^import "server-only";\n/m, ""));
  }
  rmSync(tmp, { recursive: true, force: true });
  applyPatches();
  writeFileSync(join(VENDOR, "UPSTREAM"), `${UPSTREAM}@${PINNED}\n`);
  console.log(`✔ Engine in vendor/engine, compiler in vendor/compiler (watermark patched out). Root: ${ROOT}`);
}
