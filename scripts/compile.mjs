// designs/<scene>.json (layout-based, no coordinates — GitDiagram's "designer" language)
//   → solved with GitDiagram's own layout engine → spliced into plan.json.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { COMPILER, die, loadProject, readJson, requireVendor, run, scenesOf, writeJson } from "./lib/project.mjs";

const TEXT_EXT = new Set([".r", ".rmd", ".qmd", ".stan", ".py", ".js", ".ts", ".md", ".txt", ".csv", ".tsv", ".json", ".yml", ".yaml", ".sh", ".jl", ".m", ".c", ".cpp", ".h", ".tex", ".bib", ".toml", ".cfg", ".ini", ".rproj", ".html", ".css", ".sql", ""]);

/** Shallow clone of the film's repository into <project>/.repo (paths + verbatim source for checks). */
export async function cloneRepo(dir, { refresh = false } = {}) {
  const { project } = loadProject(dir);
  const target = join(dir, ".repo");
  if (existsSync(target) && !refresh) return target;
  if (existsSync(target)) await run("rm", ["-rf", target]);
  await run("git", ["clone", "-q", "--depth", "1", `https://github.com/${project.repo}.git`, target]);
  console.log(`✔ cloned ${project.repo} → ${relative(process.cwd(), target)}`);
  return target;
}

function walk(root, base = root, out = []) {
  for (const name of readdirSync(root)) {
    if (name === ".git") continue;
    const p = join(root, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, base, out);
    else out.push({ path: relative(base, p), size: s.size, abs: p });
  }
  return out;
}

export async function repoFacts(dir, plan, project) {
  const repo = await cloneRepo(dir);
  const files = walk(repo);
  const sourceText = files
    .filter((f) => f.size < 400_000 && TEXT_EXT.has(extname(f.path).toLowerCase()))
    .map((f) => `--- ${f.path}\n${readFileSync(f.abs, "utf8")}`)
    .join("\n");
  const pictureSizes = {};
  for (const [id, url] of Object.entries(plan.images || {})) {
    const p = join(dir, String(url).replace(/^\/project\//, ""));
    if (!existsSync(p)) continue;
    const [w, h] = (await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", p])).trim().split(",").map(Number);
    pictureSizes[id] = { width: w, height: h };
  }
  return { name: project.meta.repo, paths: files.map((f) => f.path), sourceText, images: Object.keys(plan.images || {}), pictureSizes };
}

export async function compile(dir, designArg) {
  requireVendor();
  const { project, plan } = loadProject(dir);
  const designsDir = join(dir, "designs");
  const names = designArg ? [designArg] : existsSync(designsDir) ? readdirSync(designsDir).filter((f) => f.endsWith(".json")).sort() : [];
  if (!names.length) die("No designs to compile (designs/*.json).");
  const { normalizeShots } = await import(pathToFileURL(join(COMPILER, "shots.ts")).href);
  const facts = await repoFacts(dir, plan, project);
  for (const name of names) {
    const path = existsSync(name) ? name : join(designsDir, name.endsWith(".json") ? name : `${name}.json`);
    const d = readJson(path);
    if (!d.scene || !Array.isArray(d.beats) || !d.beats.length) die(`${path}: needs "scene" and "beats"`);
    const script = { title: plan.title, outro: plan.outro, beats: d.beats.map((b) => ({ scene: d.scene, narration: b.narration, brief: b.brief || "" })) };
    const designed = new Map(
      d.beats.map((b, i) => [i, { ...(i === 0 ? { layout: d.layout, transition: d.transition || "push" } : {}), elements: b.elements || [], actions: b.actions || [] }]),
    );
    const { plan: built, warnings } = normalizeShots(script, designed, facts);
    for (const w of warnings) console.log(`  ! ${path}: ${w}`);
    if (d.beats[0] && built.beats[0] && d.transition) built.beats[0].transition = d.transition;

    // Splice: replace the scene named `replace` (default: same name), else insert after `after` (or append).
    const scenes = scenesOf(plan);
    const old = scenes.find((s) => s.name === (d.replace || d.scene));
    if (old) plan.beats.splice(old.beats[0], old.beats.length, ...built.beats);
    else {
      const after = d.after ? scenes.find((s) => s.name === d.after) : null;
      if (d.after && !after) die(`${path}: "after" scene "${d.after}" not found. Scenes: ${scenes.map((s) => s.name).join(", ")}`);
      const at = after ? after.beats.at(-1) + 1 : d.before ? scenes.find((s) => s.name === d.before)?.beats[0] ?? plan.beats.length : plan.beats.length;
      plan.beats.splice(at, 0, ...built.beats);
    }
    console.log(`✔ compiled ${relative(dir, path)} → scene "${d.scene}" (${built.beats.length} beats) ${old ? "replaced" : "inserted"}`);
  }
  writeJson(join(dir, "plan.json"), plan);
}
