import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { generateGate, renderGateSVG } from "../dist/core/index.js";

// All ironwork comes directly from the public core API. The surrounding colors,
// typography, and example copy belong to this documentation composition.
const output = new URL("../docs/assets/", import.meta.url);
const dimensions = { width: 344, height: 236 };
const examples = [
  {
    family: "courtyard",
    name: "Cour intérieure",
    eyebrow: "MAISON CLAIR",
    caption: "A quiet place to begin.",
    use: "Hospitality",
    colors: ["#fbf7ef", "#51493b", "#f0e7d7", "#302e28", "#756b59"],
    density: 0.4,
    curvature: 0.66,
    peakHeight: 0.56,
    sideComplexity: 0.46,
  },
  {
    family: "fleuron",
    name: "Fleur de lys",
    eyebrow: "ATELIER BOTANIQUE",
    caption: "The art of small details.",
    use: "Atelier",
    colors: ["#143e35", "#d0b579", "#214a3e", "#f6edda", "#c9c8ae"],
    density: 0.7,
    curvature: 0.84,
    peakHeight: 0.68,
    sideComplexity: 0.72,
  },
  {
    family: "arcade",
    name: "Les Arcades",
    eyebrow: "ÉDITIONS DU PASSAGE",
    caption: "Stories with a sense of place.",
    use: "Editorial",
    colors: ["#eee8df", "#9a623f", "#e5d9c7", "#513b2c", "#7b6653"],
    density: 0.52,
    curvature: 0.74,
    peakHeight: 0.48,
    sideComplexity: 0.56,
  },
  {
    family: "vine",
    name: "Jardin secret",
    eyebrow: "LE CARNET VERT",
    caption: "Let a little nature in.",
    use: "Botanical",
    colors: ["#e1e6d9", "#486247", "#d5ddc9", "#2e4b34", "#64715b"],
    density: 0.65,
    curvature: 0.92,
    peakHeight: 0.52,
    sideComplexity: 0.78,
  },
  {
    family: "fan",
    name: "L’Heure bleue",
    eyebrow: "RENDEZ-VOUS À PARIS",
    caption: "An evening to remember.",
    use: "Invitation",
    colors: ["#1d2c42", "#b8c5da", "#283a54", "#f0ece2", "#afbdd0"],
    density: 0.64,
    curvature: 0.64,
    peakHeight: 0.72,
    sideComplexity: 0.5,
  },
  {
    family: "volute",
    name: "Belle Époque",
    eyebrow: "LA COLLECTION PRIVÉE",
    caption: "For things worth keeping.",
    use: "Collection",
    colors: ["#4a2431", "#d9b093", "#5b303c", "#f6eadd", "#d0b7b4"],
    density: 0.72,
    curvature: 0.9,
    peakHeight: 0.62,
    sideComplexity: 0.8,
  },
];

const escapeXml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const text = (x, y, value, size, color, attributes = "") =>
  `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" ${attributes}>${escapeXml(value)}</text>`;

const documentSvg = (width, height, title, description, contents) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description" font-family="Arial, Helvetica, sans-serif">
<title id="title">${escapeXml(title)}</title>
<desc id="description">${escapeXml(description)}</desc>
${contents}
</svg>\n`;

const cards = examples.map((example, index) => {
  const { family, density, curvature, peakHeight, sideComplexity } = example;
  const [background, stroke, surface, ink, muted] = example.colors;
  const options = {
    generationVersion: 3,
    seed: `readme-${family}`,
    family,
    density,
    curvature,
    symmetry: 1,
    peakHeight,
    sideComplexity,
  };
  const geometry = generateGate(dimensions, options);
  const svg = renderGateSVG(geometry, { stroke, surface });
  const insets = geometry.contentInsets;
  // The content is checked against these actual generated insets in Chromium.
  const safe = {
    left: insets.left,
    top: insets.top,
    right: dimensions.width - insets.right,
    bottom: dimensions.height - insets.bottom,
  };
  const content = `<g data-content="${family}" text-anchor="middle">
${text(172, 115, example.eyebrow, 10, muted, 'letter-spacing="1.8"')}
${text(172, 155, example.name, 31, ink, 'font-family="Georgia, Times New Roman, serif"')}
<path d="M154 175 H190" stroke="${stroke}" stroke-width="1"/>
${text(172, 198, example.caption, 12, muted)}
</g>`;
  const card = `<g data-example="${family}">
<rect width="368" height="298" rx="4" fill="${background}"/>
<g transform="translate(12 16)" data-safe="${escapeXml(JSON.stringify(safe))}">
${svg}
${content}
</g>
${text(22, 279, `${String(index + 1).padStart(2, "0")} / ${family}`, 12, muted, 'letter-spacing="0.5"')}
${text(346, 279, example.use, 11, muted, 'text-anchor="end"')}
</g>`;
  return { example, options, paint: { stroke, surface }, card, svg };
});

await mkdir(new URL("examples/", output), { recursive: true });
for (const { example, options, paint, card, svg } of cards) {
  const metadata = `<metadata>${escapeXml(JSON.stringify({ dimensions, options, paint }))}</metadata>`;
  await writeFile(
    new URL(`examples/${example.family}.svg`, output),
    documentSvg(
      368,
      298,
      `${example.name} — ${example.family}`,
      `An illustrative ${example.use.toLowerCase()} card with an unmodified generation 3 ${example.family} frame from card-gate-frame.`,
      `${metadata}\n${card}`,
    ),
  );
  await writeFile(new URL(`examples/${example.family}-frame.svg`, output), `${svg}\n`);
}

const hero = documentSvg(
  1200,
  820,
  "Card Gate Frame — Ornament, by design.",
  "Six real generation 3 SVG frames: Courtyard on ivory, Fleuron in gold on forest green, Arcade in copper on limestone, Vine on sage, Fan in silver on midnight blue, and Volute in rose gold on burgundy. The typography and backgrounds illustrate possible uses of the library.",
  `<rect width="1200" height="820" rx="8" fill="#f0ede6"/>
${text(32, 43, "CARD GATE FRAME", 13, "#615f54", 'letter-spacing="2.5"')}
${text(32, 100, "Ornament, by design.", 48, "#2f352d", 'font-family="Georgia, Times New Roman, serif"')}
${text(1168, 69, "French ironwork. Rendered in SVG.", 16, "#615f54", 'text-anchor="end"')}
${text(1168, 95, "Six families. A seed of your own.", 16, "#615f54", 'text-anchor="end"')}
${cards.map(({ card }, index) => `<g transform="translate(${32 + (index % 3) * 384} ${138 + Math.floor(index / 3) * 314})">${card}</g>`).join("\n")}
<path d="M32 779 H1168" stroke="#d4d0c5"/>
${text(32, 805, "REAL GENERATED FRAMES · GENERATION 3", 11, "#615f54", 'letter-spacing="1.4"')}
${text(1168, 805, "Seeded geometry  /  DOM-free core  /  Zero runtime dependencies", 12, "#615f54", 'text-anchor="end"')}`,
);
const heroPath = new URL("readme-demo.svg", output);
await writeFile(heroPath, hero);

if (!process.argv.includes("--svg-only")) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 820 },
      deviceScaleFactor: 2,
    });
    await page.setContent(`<style>body{margin:0}svg{display:block}</style>${hero}`);
    await page.evaluate(() => document.fonts.ready);
    const violations = await page.locator("[data-safe]").evaluateAll((groups) =>
      groups.flatMap((group) => {
        const safe = JSON.parse(group.getAttribute("data-safe"));
        return [...group.querySelectorAll("[data-content] text")].flatMap((element) => {
          const box = element.getBBox();
          return box.x < safe.left ||
            box.y < safe.top ||
            box.x + box.width > safe.right ||
            box.y + box.height > safe.bottom
            ? [element.textContent]
            : [];
        });
      }),
    );
    assert.deepEqual(violations, [], "Example copy must fit inside generated content insets");

    // Render through <img>, just as a README does. This also checks that the SVG
    // works in image mode without scripts, external styles, fonts, or resources.
    const source = Buffer.from(await readFile(heroPath)).toString("base64");
    await page.setContent(
      `<style>body{margin:0}img{display:block;width:100%;height:auto}</style><img alt="Six generated ornamental frame examples" src="data:image/svg+xml;base64,${source}">`,
    );
    await page.locator("img").evaluate((element) => element.decode());
    await page.screenshot({ path: fileURLToPath(new URL("readme-demo.png", output)) });
    const qaRoot = new URL("../test-results/readme-demo/", import.meta.url);
    await mkdir(qaRoot, { recursive: true });
    for (const width of [880, 375]) {
      await page.setViewportSize({ width, height: Math.ceil((820 * width) / 1200) });
      await page.screenshot({ path: fileURLToPath(new URL(`${width}.png`, qaRoot)) });
    }
  } finally {
    await browser.close();
  }
}

process.stdout.write("Generated README showcase, six example cards, and six raw frame SVGs.\n");
