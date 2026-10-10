// Lints plan.json against the rules the engine and the house style depend on.
// Errors break the film; warnings are taste. Run after every edit.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadProject, normWord, readJson, scenesOf, words } from "./lib/project.mjs";

const KINDS = ["heading", "text", "code", "terminal", "box", "chip", "file", "tree", "table", "bars", "number", "stamp", "browser", "request", "list", "svg", "image", "arrow"];
const ACTIONS = ["highlight", "dim", "restore", "exit", "strike", "pulse", "shake", "check", "cross", "replace", "count", "move", "type", "flow", "scan", "focus", "reset"];
const TONES = ["plain", "accent", "soft", "ok", "bad", "ghost"];

/** Same fallback the engine uses: exact word first, then a shared stem (>3 chars). */
function cueOk(cue, narration) {
  const c = normWord(cue);
  if (!c) return true;
  const ws = words(narration).map(normWord);
  return ws.includes(c) || ws.some((w) => (c.length > 3 && w.startsWith(c)) || (w.length > 3 && c.startsWith(w)));
}

/** timing.json records the narration it was voiced from; any difference means re-voice. */
export function isStale(plan, timing) {
  if (timing.beats.length !== plan.beats.length) return true;
  if (Array.isArray(timing.narration)) return plan.beats.some((b, i) => b.narration !== timing.narration[i]);
  return plan.beats.some((b, i) => words(b.narration).length !== timing.beats[i].words.length);
}

export function check(dir, { quiet = false } = {}) {
  const { plan } = loadProject(dir);
  const errors = [];
  const warns = [];
  const E = (m) => errors.push(m);
  const W = (m) => warns.push(m);

  if (!plan.title) W("no title");
  if (!plan.outro) W("no outro line (end card falls back to the title)");
  else if (words(plan.outro.replace(/\*/g, "")).length > 8) W(`outro is ${words(plan.outro).length} words (aim ≤ 8)`);

  const total = plan.beats.reduce((n, b) => n + words(b.narration).length, 0);
  const secs = total / 2.7;
  if (total < 120 || total > 260) W(`narration is ${total} words (~${secs.toFixed(0)}s); GitDiagram's sweet spot is 195–220 (~80–90s)`);

  const scenes = scenesOf(plan);
  const seenScene = new Set();
  for (const sc of scenes) {
    if (seenScene.has(sc.name)) E(`scene "${sc.name}" appears twice non-consecutively — rename one (scenes are runs of beats with the same name)`);
    seenScene.add(sc.name);
    const ids = new Map();
    let accents = 0;
    for (const i of sc.beats) {
      const b = plan.beats[i];
      const where = `beat ${i} [${sc.name}]`;
      const n = words(b.narration).length;
      if (!n) E(`${where}: empty narration`);
      if (n > 22) W(`${where}: ${n} words — split it (beats are 4–16 words, one visual change each)`);
      if (/https?:\/\/|www\./.test(b.narration)) W(`${where}: narration contains a URL (never read links aloud)`);
      for (const el of b.elements || []) {
        if (!KINDS.includes(el.kind)) E(`${where}: unknown kind "${el.kind}"`);
        if (!el.id) E(`${where}: element without id`);
        if (ids.has(el.id)) E(`${where}: duplicate id "${el.id}" in scene (first in beat ${ids.get(el.id)})`);
        ids.set(el.id, i);
        if (el.at && !cueOk(el.at, b.narration)) E(`${where}: cue "${el.at}" (${el.id}) not in this beat's narration — it would appear at the beat start`);
        if (el.kind === "box" && el.tone === "accent") accents++;
        if (el.tone && !TONES.includes(el.tone) && el.kind !== "text") W(`${where}: tone "${el.tone}" unknown on ${el.id}`);
        if (el.kind !== "arrow") {
          if ([el.x, el.y, el.w, el.h].some((v) => typeof v !== "number")) E(`${where}: ${el.id} missing x/y/w/h — compile designs instead of hand-adding layout-free elements to plan.json`);
          else if (el.x < 0 || el.y < 0 || el.x + el.w > 16.05 || el.y + el.h > 9.05) W(`${where}: ${el.id} pokes outside the 16×9 canvas`);
        } else {
          for (const end of [el.from, el.to]) if (!ids.has(end)) E(`${where}: arrow ${el.id} points at "${end}", not (yet) in the scene`);
        }
      }
      for (const a of b.actions || []) {
        if (!ACTIONS.includes(a.do)) E(`${where}: unknown action "${a.do}"`);
        if (a.at && !cueOk(a.at, b.narration)) E(`${where}: action cue "${a.at}" not in narration`);
        for (const t of [].concat(a.target || [])) if (!ids.has(t)) E(`${where}: action ${a.do} targets "${t}", not in the scene yet`);
      }
    }
    const visible = [...ids.keys()].filter((id) => sc.beats.some((i) => (plan.beats[i].elements || []).some((e) => e.id === id && e.kind !== "arrow")));
    if (visible.length > 7) W(`scene "${sc.name}": ${visible.length} elements (≤ 7, ideally 3–6)`);
    if (accents > 1) W(`scene "${sc.name}": ${accents} accent boxes (one subject per scene)`);
    if (sc.beats.length > 5) W(`scene "${sc.name}": ${sc.beats.length} beats (2–4 is the rhythm)`);
  }
  if (scenes.length && (scenes.length < 5 || scenes.length > 12)) W(`${scenes.length} scenes (GitDiagram uses 8–10)`);

  const timingPath = join(dir, "timing.json");
  if (existsSync(timingPath)) {
    const t = readJson(timingPath);
    if (isStale(plan, t)) W("timing.json is stale (narration changed) → run `voice` before stills/render");
  } else W("no timing.json yet → run `voice`");

  if (!quiet) {
    for (const e of errors) console.log(`✖ ${e}`);
    for (const w of warns) console.log(`! ${w}`);
    console.log(`${errors.length ? "✖" : "✔"} ${plan.beats.length} beats, ${scenes.length} scenes, ${total} words (~${secs.toFixed(0)}s speech) — ${errors.length} errors, ${warns.length} warnings`);
  }
  return { errors, warns };
}
