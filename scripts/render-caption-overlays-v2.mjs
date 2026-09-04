import { chromium } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const outputDir = path.resolve("test-results/hackathon-video-v2/caption-overlays");
const blocks = (await readFile("docs/hackathon/DEMO_VIDEO_V2_SUBTITLES.srt", "utf8"))
  .trim()
  .split(/\r?\n\r?\n+/);
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
for (const [index, block] of blocks.entries()) {
  const text = block.split(/\r?\n/).slice(2).join(" ");
  const safe = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  await page.setContent(`<style>html,body{width:1920px;height:1080px;margin:0;background:transparent;overflow:hidden}.c{position:absolute;left:180px;bottom:58px;width:1560px;box-sizing:border-box;padding:17px 34px;border:1px solid rgba(255,255,255,.12);border-radius:9px;background:rgba(5,9,12,.9);color:#fff;font:600 30px/1.32 Arial,sans-serif;text-align:center}</style><div class="c">${safe}</div>`);
  await page.screenshot({ path: path.join(outputDir, `cue-${String(index + 1).padStart(2, "0")}.png`), omitBackground: true });
}
await browser.close();
