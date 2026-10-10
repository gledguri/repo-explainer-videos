#!/usr/bin/env node
// One entry point: npm run vid -- <command> <project> [flags]   (see CLAUDE.md)
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { check, isStale } from "./check.mjs";
import { cloneRepo, compile } from "./compile.mjs";
import { fetchVideo, newProject } from "./fetch.mjs";
import { die, loadProject, parseFlags, projectDir, readJson, scenesOf, writeJson } from "./lib/project.mjs";
import { render, stills } from "./render.mjs";
import { setup } from "./setup.mjs";
import { voice } from "./voice.mjs";

const HELP = `npm run vid -- <command> …
  setup [--force]                  install GitDiagram engine into vendor/ (watermark patched out)
  fetch <owner/repo> [--force]     pull GitDiagram's plan + timing + voice into projects/<repo>/
  new <owner/repo>                 empty project for a film written from scratch
  outline <project>                print scenes / beats / narration / elements (read this before editing)
  check <project>                  lint plan.json
  compile <project> [design]       designs/*.json (layout language) → plan.json
  voice <project> [--provider p]   narrate plan → voice.mp3 + timing.json (original|say|gemini|openrouter|openai|file)
  stills <project> [--beats 0,3]   PNG at the end of each beat + 3×3 contact sheets in out/stills/
  render <project> [--vertical] [--height 720] [--from s --to s]   MP4 into out/
  build <project>                  check → voice (if stale) → render
  clone <project>                  shallow-clone the repo into <project>/.repo for reading
  reset <project>                  restore GitDiagram's original plan/timing (backs up plan.json)`;

const [cmd, ...argv] = process.argv.slice(2);
const { flags, rest } = parseFlags(argv);
const P = () => projectDir(rest[0]);

function timingStale(dir) {
  const { plan } = loadProject(dir);
  const t = readJson(join(dir, "timing.json"), null);
  return !t || !existsSync(join(dir, "voice.mp3")) || isStale(plan, t);
}

function outline(dir) {
  const { plan, project } = loadProject(dir);
  const t = readJson(join(dir, "timing.json"), null);
  console.log(`# ${plan.title}   (${project.repo}; voice: ${project.voice?.provider})\noutro: ${plan.outro}\n`);
  for (const sc of scenesOf(plan)) {
    const first = plan.beats[sc.beats[0]];
    console.log(`## ${sc.name}  [${first.transition || "auto"}]`);
    for (const i of sc.beats) {
      const b = plan.beats[i];
      const when = t?.beats[i] ? `${t.beats[i].start.toFixed(1)}–${t.beats[i].end.toFixed(1)}s` : "";
      console.log(`  ${String(i).padStart(2)} ${when.padEnd(12)} "${b.narration}"`);
      for (const e of b.elements || []) {
        const label = e.text ?? e.label ?? e.title ?? e.path ?? e.url ?? (e.lines ? e.lines[0] : "") ?? "";
        console.log(`       + ${e.kind.padEnd(8)} ${e.id.padEnd(14)} @${(e.at || "-").padEnd(12)} ${e.kind === "arrow" ? `${e.from}→${e.to}` : JSON.stringify(label).slice(0, 60)}${e.tone ? ` (${e.tone})` : ""}`);
      }
      for (const a of b.actions || []) console.log(`       ~ ${a.do.padEnd(8)} ${[].concat(a.target).join(",").padEnd(14)} @${a.at}`);
    }
  }
}

switch (cmd) {
  case "setup":
    await setup({ force: Boolean(flags.force) });
    break;
  case "fetch":
    await fetchVideo(rest[0], { force: Boolean(flags.force) });
    break;
  case "new":
    await newProject(rest[0]);
    break;
  case "outline":
    outline(P());
    break;
  case "check": {
    const { errors } = check(P());
    process.exitCode = errors.length ? 1 : 0;
    break;
  }
  case "compile":
    await compile(P(), rest[1]);
    check(P());
    break;
  case "voice":
    await voice(P(), { provider: flags.provider });
    break;
  case "stills":
    await stills(P(), { beats: flags.beats, format: flags.vertical ? "vertical" : "landscape" });
    break;
  case "render":
    await render(P(), { format: flags.vertical ? "vertical" : "landscape", height: flags.height, fps: flags.fps, from: flags.from, to: flags.to });
    break;
  case "build": {
    const dir = P();
    if (check(dir).errors.length) die("Fix the errors above first.");
    if (timingStale(dir)) await voice(dir);
    await render(dir, { format: flags.vertical ? "vertical" : "landscape", height: flags.height });
    break;
  }
  case "clone":
    await cloneRepo(P(), { refresh: true });
    break;
  case "reset": {
    const dir = P();
    const src = readJson(join(dir, "source/artifact.json"));
    if (existsSync(join(dir, "plan.json"))) copyFileSync(join(dir, "plan.json"), join(dir, `plan.backup-${Date.now()}.json`));
    const plan = structuredClone(src.plan);
    const old = readJson(join(dir, "plan.json"), {});
    if (old.images) plan.images = old.images;
    writeJson(join(dir, "plan.json"), plan);
    writeJson(join(dir, "timing.json"), { ...src.timing, narration: src.plan.beats.map((b) => b.narration) });
    console.log("✔ plan.json + timing.json restored from source/ (old plan backed up)");
    break;
  }
  default:
    console.log(HELP);
}
