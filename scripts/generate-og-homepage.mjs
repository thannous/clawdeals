#!/usr/bin/env node
/**
 * Generate localized homepage OG images using Playwright.
 * Run all: node scripts/generate-og-homepage.mjs
 * Run one: node scripts/generate-og-homepage.mjs es
 */
import { chromium } from "playwright";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../public/og");

const variants = [
  {
    lang: "en",
    title: "Agent-first marketplace",
    subtitle: "Your agents monitor, negotiate, and operate.",
  },
  {
    lang: "fr",
    title: "Marketplace agent-first",
    subtitle: "Vos agents surveillent, négocient, et opèrent.",
  },
  {
    lang: "es",
    title: "Mercado para agentes",
    subtitle: "Tus agentes supervisan, negocian y operan.",
  },
];

function buildHtml({ title, subtitle }) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: 1200px;
    height: 630px;
    background: #1a1a1b;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    overflow: hidden;
    position: relative;
  }

  /* Top accent line */
  .top-line {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: linear-gradient(90deg, #2dd4bf, #22d3ee);
  }

  .container {
    padding: 64px 80px;
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  /* Logo row */
  .logo-row {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 64px;
  }

  .logo-icon {
    width: 64px;
    height: 64px;
    position: relative;
    flex-shrink: 0;
  }

  .logo-icon svg {
    width: 100%;
    height: 100%;
  }

  .logo-text {
    font-size: 28px;
    font-weight: 800;
    color: #e5e5e5;
    letter-spacing: 0.15em;
  }

  /* Title */
  .title {
    font-size: 72px;
    font-weight: 800;
    color: #ffffff;
    line-height: 1.1;
    margin-bottom: 24px;
  }

  /* Subtitle */
  .subtitle {
    font-size: 28px;
    font-weight: 400;
    color: #9ca3af;
    line-height: 1.4;
  }

  /* Footer */
  .footer {
    margin-top: auto;
    font-size: 20px;
    font-weight: 700;
    color: #FF5F1F;
  }
</style>
</head>
<body>
  <div class="top-line"></div>
  <div class="container">
    <div class="logo-row">
      <div class="logo-icon">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
          <defs>
            <clipPath id="clip">
              <polygon points="0,0 410,0 512,102 512,512 0,512"/>
            </clipPath>
            <pattern id="haz" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="20" height="40" fill="#000" opacity="0.18"/>
            </pattern>
          </defs>
          <rect width="512" height="512" fill="#FF5F1F" clip-path="url(#clip)"/>
          <rect width="512" height="512" fill="url(#haz)" clip-path="url(#clip)"/>
          <text x="256" y="340" text-anchor="middle"
            font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif"
            font-size="280" font-weight="800" fill="#0A0A0B" letter-spacing="-14">CD</text>
        </svg>
      </div>
      <span class="logo-text">CLAWDEALS</span>
    </div>

    <h1 class="title">${title}</h1>
    <p class="subtitle">${subtitle}</p>

    <div class="footer">clawdeals.com</div>
  </div>
</body>
</html>`;
}

async function main() {
  const requestedLanguages = new Set(process.argv.slice(2));
  const selectedVariants = requestedLanguages.size > 0
    ? variants.filter((variant) => requestedLanguages.has(variant.lang))
    : variants;
  if (selectedVariants.length !== requestedLanguages.size) {
    throw new Error(`Unknown locale. Available locales: ${variants.map((variant) => variant.lang).join(", ")}`);
  }

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });

  for (const v of selectedVariants) {
    const page = await context.newPage();
    await page.setContent(buildHtml(v), { waitUntil: "networkidle" });
    // Give fonts a moment to load
    await page.waitForTimeout(500);
    const outPath = path.join(outDir, `${v.lang}.png`);
    await page.screenshot({ path: outPath, type: "png" });
    console.log(`✓ ${outPath}`);
    await page.close();
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
