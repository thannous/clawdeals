import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = "https://clawdeals.com";
const frameDir = path.resolve("test-results/hackathon-video-v2/frames");
await mkdir(frameDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, colorScheme: "dark" });
page.setDefaultTimeout(20_000);

async function shot(name, title, detail) {
  await page.evaluate(
    ({ title: sceneTitle, detail: sceneDetail }) => {
      document.getElementById("hackathon-v2-production-overlay")?.remove();
      const overlay = document.createElement("div");
      overlay.id = "hackathon-v2-production-overlay";
      overlay.style.cssText = "position:fixed;z-index:2147483647;top:34px;left:50%;transform:translateX(-50%);max-width:1500px;padding:14px 28px;border:1px solid rgba(86,255,169,.65);background:rgba(5,9,12,.9);box-shadow:0 16px 60px rgba(0,0,0,.45);color:#f5f7f8;font:700 28px/1.2 Arial,sans-serif;letter-spacing:.01em;text-align:center;pointer-events:none";
      const heading = document.createElement("div");
      heading.textContent = sceneTitle;
      overlay.appendChild(heading);
      const note = document.createElement("div");
      note.textContent = sceneDetail;
      note.style.cssText = "margin-top:5px;color:#56ffa9;font:600 15px/1.35 ui-monospace,monospace;letter-spacing:.06em;text-transform:uppercase";
      overlay.appendChild(note);
      document.body.appendChild(overlay);
    },
    { title, detail }
  );
  await page.screenshot({ path: path.join(frameDir, `${name}.jpg`), type: "jpeg", quality: 92 });
}

await page.goto(`${baseUrl}/browse/90000000-0000-4000-8000-000000000001`, { waitUntil: "networkidle" });
await shot("01a-listing-proof", "From listing to agent mission in one click", "Production · €1,150 · Paris · FR");
await page.getByTestId("listing-ask-agent").click();
await page.getByTestId("buy-mission-form").scrollIntoViewIfNeeded();
await shot("01b-prefilled-mission", "From listing to agent mission in one click", "Production listing context attached");

await page.goto(`${baseUrl}/browse`, { waitUntil: "networkidle" });
await shot("04a-marketplace-grid", "A marketplace designed for humans and agents", "Production · France · Spain · United Kingdom");
await page.goto(`${baseUrl}/browse/90000000-0000-4000-8000-000000000001`, { waitUntil: "networkidle" });
await page.getByTestId("listing-gallery-thumb-1").click();
await shot("04b-gallery", "A marketplace designed for humans and agents", "Production product gallery");
await page.getByTestId("listing-location").scrollIntoViewIfNeeded();
await shot("04c-location", "A marketplace designed for humans and agents", "Production · Paris · FR · map context");
await page.getByTestId("listing-similar").scrollIntoViewIfNeeded();
await shot("04d-similar", "A marketplace designed for humans and agents", "Production alternatives · same market");

await page.goto(`${baseUrl}/webmcp`, { waitUntil: "networkidle" });
await shot("06a-webmcp-tools", "Built for WebMCP-native commerce", "Production · discoverable purchasing tools");
await page.goto(`${baseUrl}/fr/webmcp`, { waitUntil: "networkidle" });
await page.getByTestId("buy-mission-form").scrollIntoViewIfNeeded();
await shot("06c-localized", "Built for WebMCP-native commerce", "Production · localized guidance · France");

await page.goto(baseUrl, { waitUntil: "networkidle" });
await shot("08-closing", "ClawDeals — Ready when your agent is.", "Production · clawdeals.com");

await browser.close();
const metadataPath = path.resolve("test-results/hackathon-video-v2/capture-metadata.json");
const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
metadata.proof_layer = "LOCAL+PRODUCTION_PUBLIC";
metadata.data_environment = "isolated sandbox for mutable proof; clawdeals.com for public frames";
metadata.production_base_url = baseUrl;
metadata.production_frames = [
  "01a-listing-proof",
  "01b-prefilled-mission",
  "04a-marketplace-grid",
  "04b-gallery",
  "04c-location",
  "04d-similar",
  "06a-webmcp-tools",
  "06c-localized",
  "08-closing"
];
await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
console.log(JSON.stringify({ base_url: baseUrl, production_frames: 9, publication_status: "NOT_PUBLISHED" }));
