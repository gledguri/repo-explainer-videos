// Frame-by-frame render (seek → screenshot → ffmpeg), then mix narration + the engine's sound effects.
// Also: stills at the end of every beat, tiled into contact sheets, for quick visual review.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ENGINE, die, loadProject, readJson, run, scenesOf } from "./lib/project.mjs";
import { openStage } from "./lib/stage.mjs";

// From GitDiagram's mixer: measured peak (dBFS) per effect; hits normalized to -6 dB then cue gain.
const SFX_PEAK_DB = { pop: -5.3, stamp: -10.4, tick: -5.9, whoosh: -0.7 };
const MASTER_GAIN = 0.9;
const sfxGain = (name, db) => 10 ** ((-6 - (SFX_PEAK_DB[name] ?? -6) + db) / 20);

function encoder(args) {
  const child = spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
  let err = "";
  child.stderr.on("data", (d) => (err = (err + d).slice(-2000)));
  const done = new Promise((ok, fail) => child.on("close", (c) => (c === 0 ? ok() : fail(new Error(`ffmpeg ${c}: ${err}`)))));
  return {
    write: (buf) => (child.stdin.write(buf) ? Promise.resolve() : new Promise((r) => child.stdin.once("drain", r))),
    finish: () => (child.stdin.end(), done),
  };
}

async function mixAudio({ dir, timing, sfx, out }) {
  const voices = readJson(join(dir, "voices.json"), [{ start: 0.4 }]);
  const inputs = [];
  const chains = [];
  const labels = [];
  const add = (path) => (inputs.push("-i", path), inputs.length / 2 - 1);
  if (existsSync(join(dir, "voice.mp3"))) {
    const k = add(join(dir, "voice.mp3"));
    const ms = Math.round((voices[0]?.start ?? 0.4) * 1000);
    chains.push(`[${k}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms},volume=${MASTER_GAIN}[v]`);
    labels.push("[v]");
  } else console.warn("! no voice.mp3 — rendering without narration");
  const rates = {};
  for (const [i, cue] of sfx.entries()) {
    if (!(cue.name in SFX_PEAK_DB)) continue;
    const path = join(ENGINE, "assets/sfx", `${cue.name}.mp3`);
    if (!existsSync(path)) continue;
    rates[cue.name] ??= Number((await run("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate", "-of", "csv=p=0", path])).trim()) || 44100;
    const k = add(path); // one input per cue: an input pad can only feed one chain
    const ms = Math.round(cue.t * 1000);
    const sr = Math.round(rates[cue.name] * (cue.rate || 1));
    chains.push(`[${k}:a]asetrate=${sr},aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms},volume=${(MASTER_GAIN * sfxGain(cue.name, cue.gain || 0)).toFixed(4)}[s${i}]`);
    labels.push(`[s${i}]`);
  }
  if (!labels.length) return null;
  const graph = `${chains.join(";")};${labels.join("")}amix=inputs=${labels.length}:normalize=0:duration=longest,apad=whole_dur=${timing.DURATION + 2},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,atrim=0:${timing.DURATION}[mix]`;
  await run("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", graph, "-map", "[mix]", "-c:a", "aac", "-b:a", "192k", out]);
  return out;
}

export async function render(dir, { format = "landscape", height, fps, from = 0, to, captions } = {}) {
  const { project, plan } = loadProject(dir);
  const timing = readJson(join(dir, "timing.json"));
  const vertical = format === "vertical";
  const h = Number(height || project.render?.height || 1080);
  const scale = vertical ? h / 1920 : h / 1080;
  const FPS = Number(fps || project.render?.fps || 30);
  const outDir = join(dir, "out");
  mkdirSync(outDir, { recursive: true });
  const stage = await openStage({ dir, project, plan, timing, format, scale, captions: captions ?? project.captions !== false });
  const silent = join(outDir, ".silent.mp4");
  const end = Math.min(Number(to ?? timing.DURATION), timing.DURATION);
  const first = Math.floor(Number(from) * FPS);
  const last = Math.ceil(end * FPS);
  try {
    const enc = encoder(["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "pipe:0", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(FPS), silent]);
    const t0 = Date.now();
    for (let f = first; f < last; f++) {
      await stage.seek(f / FPS);
      await enc.write(await stage.page.screenshot({ type: "jpeg", quality: 92, optimizeForSpeed: true }));
      if ((f - first) % (FPS * 5) === 0) process.stdout.write(`\r  frame ${f - first}/${last - first}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    }
    await enc.finish();
    process.stdout.write("\n");
  } finally {
    await stage.close();
  }
  if (stage.errors.length) console.warn(`! stage errors: ${stage.errors.join(" | ")}`);
  const name = `${project.meta.repo}${vertical ? "-vertical" : ""}${first || to ? `-${from}-${end}` : ""}.mp4`;
  const out = join(outDir, name);
  const audio = first === 0 && !to ? await mixAudio({ dir, timing, sfx: stage.sfx, out: join(outDir, ".mix.m4a") }) : null;
  if (audio) await run("ffmpeg", ["-y", "-loglevel", "error", "-i", silent, "-i", audio, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "copy", "-shortest", "-movflags", "+faststart", out]);
  else await run("ffmpeg", ["-y", "-loglevel", "error", "-i", silent, "-c", "copy", "-movflags", "+faststart", out]);
  rmSync(silent, { force: true });
  if (audio) rmSync(audio, { force: true });
  console.log(`✔ ${out}`);
  return out;
}

/** One still at the end of each beat (what the viewer sees once the beat has played), plus contact sheets. */
export async function stills(dir, { beats: only, format = "landscape" } = {}) {
  const { project, plan } = loadProject(dir);
  const timing = readJson(join(dir, "timing.json"));
  if (timing.beats.length !== plan.beats.length) die(`timing.json has ${timing.beats.length} beats but plan.json has ${plan.beats.length}. Run: npm run vid -- voice ${dir}`);
  const outDir = join(dir, "out/stills");
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const stage = await openStage({ dir, project, plan, timing, format, scale: 0.5, captions: true });
  const wanted = only ? String(only).split(",").map(Number) : plan.beats.map((_, i) => i);
  const files = [];
  try {
    for (const i of wanted) {
      const b = timing.beats[i];
      const next = timing.beats[i + 1];
      const t = Math.max(b.start, Math.min(b.end + 0.3, (next?.start ?? b.end + 1) - 0.05));
      await stage.seek(t);
      const f = join(outDir, `beat-${String(i).padStart(2, "0")}.jpg`);
      await stage.page.screenshot({ type: "jpeg", quality: 85, path: f });
      files.push(f);
    }
    await stage.seek(timing.DURATION - 0.1);
    const endCard = join(outDir, "zz-end.jpg");
    await stage.page.screenshot({ type: "jpeg", quality: 85, path: endCard });
    files.push(endCard);
  } finally {
    await stage.close();
  }
  if (stage.errors.length) console.warn(`! stage errors: ${stage.errors.join(" | ")}`);
  // 3×3 contact sheets (scene names in index.txt).
  await run("ffmpeg", ["-y", "-loglevel", "error", "-pattern_type", "glob", "-i", join(outDir, "*.jpg"), "-vf", "scale=640:-1,tile=3x3", join(outDir, "sheet-%d.jpg")]);
  const scenes = scenesOf(plan);
  writeFileSync(
    join(outDir, "index.txt"),
    wanted.map((i) => `beat-${String(i).padStart(2, "0")}  [${plan.beats[i].scene}]  ${plan.beats[i].narration}`).join("\n") + `\nzz-end  outro: ${plan.outro}\n\nscenes: ${scenes.map((s) => s.name).join(" → ")}\n`,
  );
  console.log(`✔ ${files.length} stills + sheets in ${outDir} (sheets are 3×3, read left→right, top→bottom; see index.txt)`);
}
