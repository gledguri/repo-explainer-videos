// Opens the (patched) GitDiagram stage in headless Chrome with a project's plan + timing,
// exactly like GitDiagram's own renderer does, and exposes seek(t) + screenshot.
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { ENGINE, readJson, requireVendor } from "./project.mjs";
import { REPO_GLYPH } from "../setup.mjs";

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".mp3": "audio/mpeg", ".json": "application/json" };

function serve(projectDir) {
  const roots = { "/video-engine/": ENGINE, "/project/": projectDir };
  const server = createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const prefix = Object.keys(roots).find((p) => url.startsWith(p));
    const base = prefix && roots[prefix];
    const file = base && normalize(join(base, url.slice(prefix.length)));
    if (!file || !file.startsWith(base) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

/** CHROME_PATH, else puppeteer's own download, else an installed Chromium-family browser. */
function chromePath(puppeteer) {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  try {
    const own = puppeteer.executablePath("chrome-headless-shell");
    if (own && existsSync(own)) return own;
  } catch {}
  try {
    const own = puppeteer.executablePath();
    if (own && existsSync(own)) return own;
  } catch {}
  const local = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ].find((p) => existsSync(p));
  if (local) return local;
  throw new Error("No Chrome found. Run: npx puppeteer browsers install chrome-headless-shell  (or set CHROME_PATH)");
}

export function brandFor(project) {
  const b = project.brand || {};
  const glyph = b.glyph === "none" ? "" : b.glyph && b.glyph.startsWith("<svg") ? b.glyph : REPO_GLYPH;
  return { chip: b.chip !== false, chipText: b.chipText || "", glyphHtml: glyph, endLink: b.endLink || "", signoff: b.signoff || "" };
}

/**
 * format: "landscape" (1920×1080 CSS px) | "vertical" (1080×1920 feed cut).
 * scale: device scale factor (1 → 1080p, 2/3 → 720p).
 */
export async function openStage({ dir, project, plan, timing, format = "landscape", scale = 1, captions = true }) {
  requireVendor();
  const puppeteer = (await import("puppeteer")).default;
  const server = await serve(dir);
  const port = server.address().port;
  const executablePath = chromePath(puppeteer);
  const browser = await puppeteer.launch({ headless: /headless.shell/i.test(executablePath) ? "shell" : true, executablePath, args: ["--force-color-profile=srgb", "--hide-scrollbars"] });
  const close = async () => {
    await browser.close().catch(() => {});
    server.close();
  };
  try {
    const page = await browser.newPage();
    const vertical = format === "vertical";
    await page.setViewport({ width: vertical ? 1080 : 1920, height: vertical ? 1920 : 1080, deviceScaleFactor: scale });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message || e)));
    await page.goto(`http://127.0.0.1:${port}/video-engine/stage.html?v=local`, { waitUntil: "load", timeout: 30000 });
    const meta = project.meta || readJson(join(dir, "source/artifact.json")).meta;
    const sfx = await page.evaluate(
      (payload, brand) =>
        new Promise((resolve, reject) => {
          window.BRAND = brand;
          const timer = setTimeout(() => reject(new Error("The stage did not build in 40s.")), 40000);
          window.addEventListener("message", (event) => {
            const d = event.data || {};
            if (d.type === "ready") clearTimeout(timer), resolve(d.sfx || []);
            else if (d.type === "error") clearTimeout(timer), reject(new Error(d.message || "Stage error"));
          });
          window.postMessage({ type: "load", ...payload }, location.origin);
        }),
      {
        spec: plan,
        meta,
        timing,
        captions,
        render: true,
        ...(vertical ? { layout: "reel", feed: true, height: 1920, insets: { top: 140, bottom: 320, right: 150 } } : { layout: "landscape" }),
      },
      brandFor(project),
    );
    const seek = (t) => page.evaluate((at) => window.__renderSeek(at), t);
    return { page, sfx, seek, close, errors };
  } catch (e) {
    await close();
    throw e;
  }
}
