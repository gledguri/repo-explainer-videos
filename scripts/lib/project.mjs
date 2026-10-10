// Shared helpers: where things live, JSON IO, running processes.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const VENDOR = join(ROOT, "vendor");
export const ENGINE = join(VENDOR, "engine");
export const COMPILER = join(VENDOR, "compiler");
export const PROJECTS = join(ROOT, "projects");

/** "gledguri/Air-eDNA-quant", a github URL, a gitdiagram URL, or a project folder name → slug. */
export function parseRepo(input) {
  const s = String(input || "").trim().replace(/\/+$/, "").replace(/\.git$/, "");
  const m = s.match(/(?:github\.com|gitdiagram\.com)\/([^/\s]+)\/([^/\s?#]+)/) || s.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

export const slugOf = (repo) => repo.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");

/** Resolve a project from a folder name, a path, or owner/repo. */
export function projectDir(arg) {
  if (!arg) die("Name a project (folder under projects/, or owner/repo).");
  if (existsSync(join(PROJECTS, arg, "project.json"))) return join(PROJECTS, arg);
  if (existsSync(join(resolve(arg), "project.json"))) return resolve(arg);
  const parsed = parseRepo(arg);
  if (parsed && existsSync(join(PROJECTS, slugOf(parsed.repo), "project.json"))) return join(PROJECTS, slugOf(parsed.repo));
  die(`No project found for "${arg}". Run: npm run vid -- fetch <owner/repo>  (or: new <owner/repo>)`);
}

export function readJson(path, fallback) {
  if (!existsSync(path)) {
    if (fallback !== undefined) return fallback;
    die(`Missing ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

export function loadProject(dir) {
  const project = readJson(join(dir, "project.json"));
  const plan = readJson(join(dir, "plan.json"));
  return { dir, project, plan };
}

export function die(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

export function requireVendor() {
  if (!existsSync(join(ENGINE, "stage.html"))) die("Engine not installed. Run: npm run vid -- setup");
}

/** Run a command; resolves with stdout (Buffer if raw). Rejects with stderr on failure. */
export function run(cmd, args, { input, raw = false, quiet = true, cwd } = {}) {
  return new Promise((ok, fail) => {
    const child = spawn(cmd, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    const out = [];
    let err = "";
    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => {
      err += d;
      if (!quiet) process.stderr.write(d);
    });
    child.on("error", fail);
    child.on("close", (code) => {
      const buf = Buffer.concat(out);
      code === 0 ? ok(raw ? buf : buf.toString()) : fail(new Error(`${cmd} exited ${code}: ${err.slice(-1500)}`));
    });
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

/** Lower-case, accents stripped, letters/digits only — must match the engine's cue normalizer. */
export function normWord(word) {
  return String(word)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export const words = (text) => String(text || "").split(/\s+/).filter(Boolean);

/** Scenes as runs of consecutive beats sharing a scene name. */
export function scenesOf(plan) {
  const scenes = [];
  plan.beats.forEach((beat, i) => {
    const last = scenes.at(-1);
    if (last && last.name === beat.scene) last.beats.push(i);
    else scenes.push({ name: beat.scene, beats: [i] });
  });
  return scenes;
}

export function parseFlags(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith("--")) flags[k] = argv[++i];
      else flags[k] = true;
    } else rest.push(a);
  }
  return { flags, rest };
}
