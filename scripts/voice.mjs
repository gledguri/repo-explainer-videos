// Narration: plan.json beats → voice.mp3 + timing.json (word-level clock the engine runs on).
// Mirrors GitDiagram: the whole script is read as ONE take (scene = new paragraph), then
// split back into beats by word timestamps.
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { die, normWord, readJson, run, words, writeJson } from "./lib/project.mjs";

const LEAD_IN = 0.4;
const TAIL = 3.6;
const STYLE =
  "a warm, confident senior scientist telling a smart colleague the story of a project they love; natural conversational pace with varied rhythm, breathing at commas and full stops";

const r3 = (x) => Number(x.toFixed(3));

/** The take text, and each beat's [from,to) span in it. */
export function takeText(beats) {
  let text = "";
  const spans = beats.map((beat, i) => {
    const sceneEnds = i === beats.length - 1 || beats[i + 1].scene !== beat.scene;
    const line = sceneEnds && !/[.!?…]$/.test(beat.narration) ? `${beat.narration.replace(/[,;:]$/, "")}.` : beat.narration;
    if (text) text += i > 0 && beats[i - 1].scene !== beat.scene ? "\n\n" : " ";
    const from = text.length;
    text += line;
    return { from, to: text.length };
  });
  return { text, spans };
}

const durationOf = async (path) => Number((await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path])).trim());

// ---------- providers: each returns the path of an mp3 take ----------

async function pcmToMp3(pcm, rate, out) {
  await run("ffmpeg", ["-y", "-loglevel", "error", "-f", "s16le", "-ar", String(rate), "-ac", "1", "-i", "pipe:0", "-ar", "44100", "-codec:a", "libmp3lame", "-b:a", "160k", out], { input: pcm });
}

const PROVIDERS = {
  /** macOS built-in. Free, offline, robotic — for drafts. voice: e.g. "Daniel", "Samantha"; rate: words/min. */
  async say(text, cfg, tmp) {
    const aiff = join(tmp, "take.aiff");
    const args = ["-o", aiff];
    if (cfg.voice) args.push("-v", cfg.voice);
    args.push("-r", String(cfg.rate || 175));
    writeFileSync(join(tmp, "take.txt"), text.replace(/\n\n/g, " [[slnc 350]] "));
    await run("say", [...args, "-f", join(tmp, "take.txt")]);
    const mp3 = join(tmp, "take.mp3");
    await run("ffmpeg", ["-y", "-loglevel", "error", "-i", aiff, "-ar", "44100", "-codec:a", "libmp3lame", "-b:a", "160k", mp3]);
    return mp3;
  },

  /** Exactly GitDiagram's voice (Gemini Flash TTS "Charon" via OpenRouter). Needs OPENROUTER_API_KEY. */
  async openrouter(text, cfg, tmp) {
    const key = process.env.OPENROUTER_API_KEY || die("Set OPENROUTER_API_KEY");
    const res = await fetch("https://openrouter.ai/api/v1/audio/speech", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: cfg.model || "google/gemini-3.8-flash-tts",
        input: text,
        voice: cfg.voice || "Charon",
        response_format: "pcm",
        provider: { options: { "google-ai-studio": { speech_metadata: { style: cfg.style || STYLE } } } },
      }),
    });
    if (!res.ok) die(`OpenRouter voice failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const mp3 = join(tmp, "take.mp3");
    await pcmToMp3(Buffer.from(await res.arrayBuffer()), 24000, mp3);
    return mp3;
  },

  /** Google AI Studio directly (free tier exists). Needs GEMINI_API_KEY. Same "Charon" voice family. */
  async gemini(text, cfg, tmp) {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || die("Set GEMINI_API_KEY");
    const model = cfg.model || "gemini-2.5-flash-preview-tts";
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Read this in the voice of ${cfg.style || STYLE}:\n\n${text}` }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: cfg.voice || "Charon" } } },
        },
      }),
    });
    if (!res.ok) die(`Gemini voice failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = await res.json();
    const data = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
    if (!data) die("Gemini returned no audio.");
    const mp3 = join(tmp, "take.mp3");
    await pcmToMp3(Buffer.from(data, "base64"), 24000, mp3);
    return mp3;
  },

  /** OpenAI TTS. Needs OPENAI_API_KEY. voice e.g. "onyx", "ash", "sage". */
  async openai(text, cfg, tmp) {
    const key = process.env.OPENAI_API_KEY || die("Set OPENAI_API_KEY");
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: cfg.model || "gpt-4o-mini-tts", voice: cfg.voice || "onyx", input: text, instructions: `Speak as ${cfg.style || STYLE}.`, response_format: "pcm" }),
    });
    if (!res.ok) die(`OpenAI voice failed ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const mp3 = join(tmp, "take.mp3");
    await pcmToMp3(Buffer.from(await res.arrayBuffer()), 24000, mp3);
    return mp3;
  },

  /** Your own recording (e.g. you reading the script). cfg.file: path relative to the project. */
  async file(_text, cfg, _tmp, dir) {
    if (!cfg.file) die('voice.provider "file" needs voice.file');
    return join(dir, cfg.file);
  },
};

// ---------- word timing ----------

/** Words heard in the take, with times — OpenAI whisper-1 if a key is set, else local mlx_whisper/whisper if installed. */
async function heardWords(mp3, tmp) {
  if (process.env.OPENAI_API_KEY) {
    const form = new FormData();
    form.append("file", new Blob([readFileSync(mp3)], { type: "audio/mpeg" }), "take.mp3");
    form.append("model", "whisper-1");
    form.append("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "word");
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form });
    if (res.ok) return { source: "whisper-1", words: ((await res.json()).words || []).map((w) => ({ word: w.word, start: w.start, end: w.end })) };
    console.warn(`! whisper-1 failed (${res.status}); falling back`);
  }
  for (const bin of ["mlx_whisper", "whisper"]) {
    try {
      await run("which", [bin]);
    } catch {
      continue;
    }
    const model = bin === "mlx_whisper" ? ["--model", "mlx-community/whisper-small.en-mlx"] : ["--model", "small.en"];
    await run(bin, [mp3, ...model, "--word-timestamps", "True", "--output-format", "json", "--output-dir", tmp], { quiet: true });
    const json = readJson(join(tmp, "take.json"));
    return { source: bin, words: json.segments.flatMap((s) => (s.words || []).map((w) => ({ word: w.word, start: w.start, end: w.end }))) };
  }
  return { source: "none", words: [] };
}

/** Silence-aware fallback: pauses from ffmpeg silencedetect anchor scene/sentence breaks. */
async function silences(mp3) {
  const out = await run("ffmpeg", ["-hide_banner", "-i", mp3, "-af", "silencedetect=noise=-35dB:d=0.22", "-f", "null", "-"]).catch((e) => String(e));
  const list = [];
  let start = null;
  for (const line of String(out).split("\n")) {
    const s = line.match(/silence_start: ([\d.]+)/);
    const e = line.match(/silence_end: ([\d.]+)/);
    if (s) start = Number(s[1]);
    if (e && start !== null) list.push({ start, end: Number(e[1]) }), (start = null);
  }
  return list;
}

/**
 * Give every whitespace token of the script a time. Heard words are matched with an
 * LCS on normalized words; unmatched runs are spread by character length between anchors.
 * With nothing heard, sentence pauses are snapped to detected silences.
 */
export function alignWords(text, heard, seconds, pauses = []) {
  const tokens = [...text.matchAll(/\S+/g)].map((m) => ({ from: m.index, to: m.index + m[0].length, key: normWord(m[0]), raw: m[0] }));
  const H = heard.map((h) => ({ ...h, key: normWord(h.word) })).filter((h) => h.key);
  const n = tokens.length;
  const m = H.length;
  const time = new Array(n).fill(null);
  if (m) {
    // LCS table (n, m ~ 250 → fine).
    const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--)
      for (let j = m - 1; j >= 0; j--) L[i][j] = tokens[i].key && tokens[i].key === H[j].key ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    for (let i = 0, j = 0; i < n && j < m; ) {
      if (tokens[i].key && tokens[i].key === H[j].key) (time[i] = { s: H[j].start, e: H[j].end }), i++, j++;
      else if (L[i + 1][j] >= L[i][j + 1]) i++;
      else j++;
    }
  }
  const matched = time.filter(Boolean).length;
  if (!matched && pauses.length) {
    // Anchor sentence ends to the longest pauses, in order.
    const ends = tokens.map((t, i) => (/[.!?…]$/.test(t.raw) && i < n - 1 ? i : -1)).filter((i) => i >= 0);
    const big = [...pauses].filter((p) => p.start > 0.3 && p.end < seconds - 0.2).sort((a, b) => b.end - b.start - (a.end - a.start)).slice(0, ends.length).sort((a, b) => a.start - b.start);
    if (big.length === ends.length) ends.forEach((i, k) => ((time[i] = { s: null, e: big[k].start }), tokens[i + 1] && (time[i + 1] = { s: big[k].end, e: null })));
  }
  // Fill gaps by length between known edges.
  const weight = (t) => Math.max(1, t.raw.replace(/[^\p{L}\p{N}]/gu, "").length) + (/[,;:]$/.test(t.raw) ? 3 : 0) + (/[.!?…]$/.test(t.raw) ? 5 : 0);
  const leading = pauses[0] && pauses[0].start < 0.05 ? pauses[0].end : 0;
  const S = time.map((t) => t?.s ?? null);
  const E = time.map((t) => t?.e ?? null);
  const fill = (a, b) => {
    if (a === b && S[a] != null && E[a] != null) return (time[a] = { s: S[a], e: E[a] });
    const from = S[a] ?? (a === 0 ? leading : time[a - 1].e);
    const to = Math.max(from, E[b] ?? (b === n - 1 ? seconds : (S[b + 1] ?? from)));
    const total = tokens.slice(a, b + 1).reduce((x, t) => x + weight(t), 0) || 1;
    let at = from;
    for (let k = a; k <= b; k++) {
      const d = ((to - from) * weight(tokens[k])) / total;
      time[k] = { s: at, e: at + d * 0.92 };
      at += d;
    }
  };
  // Segments end at a known end time, or just before a known start time.
  let a = 0;
  for (let k = 0; k < n; k++) {
    if (k === n - 1 || E[k] != null || S[k + 1] != null) {
      fill(a, k);
      a = k + 1;
    }
  }
  return { tokens, time, matched };
}

/** Build the engine clock from a take: plan beats + aligned words. */
export function buildTiming(beats, text, spans, aligned, seconds, start = LEAD_IN) {
  const timed = aligned.tokens.map((t, k) => ({ w: normWord(t.raw), s: r3(start + aligned.time[k].s), e: r3(start + aligned.time[k].e), offset: t.from }));
  const out = [];
  for (const span of spans) {
    const own = timed.filter((w) => w.offset >= span.from && w.offset < span.to);
    const prevEnd = out.at(-1)?.end ?? start;
    out.push({ start: own[0]?.s ?? prevEnd, end: own.at(-1)?.e ?? prevEnd, words: own.map(({ w, s, e }) => ({ w, s, e })) });
  }
  const speechEnd = out.at(-1)?.end ?? 0;
  const soundEnd = Math.max(speechEnd, start + seconds);
  return { DURATION: Math.ceil((soundEnd + TAIL) * 10) / 10, SPEECH_END: r3(speechEnd), beats: out };
}

export async function voice(dir, { provider: override } = {}) {
  const project = readJson(join(dir, "project.json"));
  const plan = readJson(join(dir, "plan.json"));
  const cfg = { ...(project.voice || {}) };
  if (override) cfg.provider = override;
  const provider = cfg.provider || "say";
  if (!plan.beats.length) die("plan.json has no beats.");

  if (provider === "original") {
    const source = readJson(join(dir, "source/artifact.json"), null) || die("No source/artifact.json — this project did not come from GitDiagram.");
    const same = source.plan.beats.length === plan.beats.length && source.plan.beats.every((b, i) => b.narration === plan.beats[i].narration);
    if (!same)
      die('Narration differs from GitDiagram\'s, so the original voice no longer fits.\nSet project.json voice.provider to "say" / "gemini" / "openrouter" / "openai", or pass --provider.');
    copyFileSync(join(dir, "source/voice-0.mp3"), join(dir, "voice.mp3"));
    writeJson(join(dir, "timing.json"), { ...source.timing, narration: plan.beats.map((b) => b.narration) });
    writeJson(join(dir, "voices.json"), source.voices);
    console.log("✔ original GitDiagram take + timing restored");
    return;
  }

  const impl = PROVIDERS[provider] || die(`Unknown voice provider "${provider}". One of: original, ${Object.keys(PROVIDERS).join(", ")}`);
  const { text, spans } = takeText(plan.beats);
  const tmp = mkdtempSync(join(tmpdir(), "vid-voice-"));
  try {
    console.log(`… voicing ${words(text).length} words with ${provider}${cfg.voice ? ` (${cfg.voice})` : ""}`);
    const take = await impl(text, cfg, tmp, dir);
    const seconds = await durationOf(take);
    const heard = await heardWords(take, tmp);
    const aligned = alignWords(text, heard.words, seconds, heard.words.length ? [] : await silences(take));
    const timing = buildTiming(plan.beats, text, spans, aligned, seconds);
    if (take !== join(dir, "voice.mp3")) copyFileSync(take, join(dir, "voice.mp3"));
    writeJson(join(dir, "timing.json"), { ...timing, narration: plan.beats.map((b) => b.narration) });
    writeJson(join(dir, "voices.json"), [{ start: LEAD_IN }]);
    const pct = aligned.tokens.length ? Math.round((100 * aligned.matched) / aligned.tokens.length) : 0;
    console.log(`✔ voice.mp3 ${seconds.toFixed(1)}s, film ${timing.DURATION}s — timing: ${heard.source === "none" ? "estimated (no transcriber; install mlx-whisper or set OPENAI_API_KEY for exact cues)" : `${heard.source}, ${pct}% words matched`}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export { existsSync };
