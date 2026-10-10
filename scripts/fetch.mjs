// Pulls a GitDiagram video (shot plan + word timing + narration take) into projects/<repo>/.
// The plan is the editable source of the film; the MP4 GitDiagram shows is rendered from it.
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PROJECTS, die, parseRepo, readJson, slugOf, writeJson } from "./lib/project.mjs";

const BASE = "https://gitdiagram.com";

export function defaultProject(meta, extra = {}) {
  return {
    repo: `${meta.owner}/${meta.repo}`,
    meta,
    voice: { provider: "original" },
    brand: { chip: true, chipText: "", glyph: "repo", endLink: "", signoff: "" },
    captions: true,
    render: { fps: 30, height: 1080 },
    ...extra,
  };
}

export async function fetchVideo(repoArg, { force = false } = {}) {
  const parsed = parseRepo(repoArg);
  if (!parsed) die(`Not a repo: ${repoArg}`);
  const res = await fetch(`${BASE}/api/video?username=${encodeURIComponent(parsed.owner)}&repo=${encodeURIComponent(parsed.repo)}`);
  if (!res.ok) die(`GitDiagram answered ${res.status}`);
  const body = await res.json();
  const video = body.video;
  if (!video) die(`GitDiagram has no video for ${parsed.owner}/${parsed.repo} yet. Make one at ${BASE}/${parsed.owner}/${parsed.repo} first.`);

  const dir = join(PROJECTS, slugOf(parsed.repo));
  const src = join(dir, "source");
  if (existsSync(join(dir, "plan.json")) && !force)
    die(`${dir} already has a plan.json (your edits). Use --force to overwrite plan/timing with GitDiagram's original.`);
  mkdirSync(src, { recursive: true });
  writeJson(join(src, "artifact.json"), video);

  // Narration take(s).
  for (let i = 0; i < (video.voices || []).length; i++) {
    const q = new URLSearchParams({ username: parsed.owner, repo: parsed.repo, beat: String(i), v: video.createdAt });
    const audio = await fetch(`${BASE}/api/video/audio?${q}`);
    if (!audio.ok) die(`Narration clip ${i} failed: ${audio.status}`);
    writeFileSync(join(src, `voice-${i}.mp3`), Buffer.from(await audio.arrayBuffer()));
  }

  // README pictures the plan shows (img1…img3): download, point the plan at local copies.
  const plan = structuredClone(video.plan);
  if (plan.images) {
    mkdirSync(join(src, "images"), { recursive: true });
    for (const [id, url] of Object.entries(plan.images)) {
      const r = await fetch(new URL(url, BASE));
      if (!r.ok) {
        console.warn(`! picture ${id} not downloaded (${r.status})`);
        continue;
      }
      const ext = (r.headers.get("content-type") || "").includes("png") ? "png" : (r.headers.get("content-type") || "").includes("webp") ? "webp" : "jpg";
      writeFileSync(join(src, "images", `${id}.${ext}`), Buffer.from(await r.arrayBuffer()));
      plan.images[id] = `/project/source/images/${id}.${ext}`;
    }
  }

  writeJson(join(dir, "plan.json"), plan);
  writeJson(join(dir, "timing.json"), { ...video.timing, narration: video.plan.beats.map((b) => b.narration) });
  writeJson(join(dir, "voices.json"), video.voices);
  if (existsSync(join(src, "voice-0.mp3"))) copyFileSync(join(src, "voice-0.mp3"), join(dir, "voice.mp3"));
  if (!existsSync(join(dir, "project.json"))) {
    // GitDiagram lower-cases names; use GitHub's canonical spelling for the on-screen link.
    const meta = { ...video.meta };
    try {
      const g = await fetch(`https://api.github.com/repos/${meta.owner}/${meta.repo}`);
      if (g.ok) Object.assign(meta, { owner: (await g.clone().json()).owner.login, repo: (await g.json()).name });
    } catch {}
    writeJson(join(dir, "project.json"), defaultProject(meta));
  }
  if (!existsSync(join(dir, "brief.md")))
    writeFileSync(
      join(dir, "brief.md"),
      `# ${video.meta.owner}/${video.meta.repo}\n\nOriginal: GitDiagram video created ${video.createdAt} (voice ${video.stats?.voice ?? "?"}).\n\n## Direction from Gled\n\n_(requests go here, newest last)_\n\n## Change log\n\n`,
    );
  const words = plan.beats.reduce((n, b) => n + b.narration.split(/\s+/).filter(Boolean).length, 0);
  console.log(`✔ ${dir}\n  "${plan.title}" — ${plan.beats.length} beats, ${words} words, ${video.timing.DURATION}s`);
  return dir;
}

/** A blank project for a film written from scratch (no GitDiagram video). */
export async function newProject(repoArg) {
  const parsed = parseRepo(repoArg);
  if (!parsed) die(`Not a repo: ${repoArg}`);
  const dir = join(PROJECTS, slugOf(parsed.repo));
  if (existsSync(join(dir, "project.json"))) die(`${dir} exists already.`);
  let meta = { owner: parsed.owner, repo: parsed.repo, url: `https://github.com/${parsed.owner}/${parsed.repo}`, description: "", stars: 0, language: "" };
  try {
    const r = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`);
    if (r.ok) {
      const g = await r.json();
      meta = { ...meta, repo: g.name, description: g.description || "", stars: g.stargazers_count, language: g.language || "" };
    }
  } catch {}
  writeJson(join(dir, "project.json"), defaultProject(meta, { voice: { provider: "say" } }));
  writeJson(join(dir, "plan.json"), { title: meta.repo, outro: "", beats: [] });
  mkdirSync(join(dir, "designs"), { recursive: true });
  writeFileSync(join(dir, "brief.md"), `# ${meta.owner}/${meta.repo}\n\nWritten from scratch.\n\n## Direction from Gled\n\n## Change log\n\n`);
  console.log(`✔ ${dir} (empty plan — write designs/*.json, then compile)`);
  return dir;
}

export { readJson };
