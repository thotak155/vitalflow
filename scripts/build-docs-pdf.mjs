#!/usr/bin/env node
/**
 * Build every docs/*.md into docs/pdf/*.pdf.
 *
 * Why: user directive — deliver documentation as PDF. The markdown source
 * stays in git for diffability; PDFs are the delivered artifact.
 *
 * Usage: pnpm docs:pdf
 */
import { readdir, mkdir } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { mdToPdf } from "md-to-pdf";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(__filename), "..");
const docsDir = resolve(repoRoot, "docs");
const outDir = resolve(docsDir, "pdf");

const stylesheet = `
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 10.5pt;
      color: #111;
      max-width: 800px;
      margin: 0 auto;
    }
    h1 { font-size: 22pt; border-bottom: 2px solid #eee; padding-bottom: 8px; }
    h2 { font-size: 16pt; margin-top: 28px; border-bottom: 1px solid #f0f0f0; padding-bottom: 4px; }
    h3 { font-size: 13pt; margin-top: 20px; }
    h4 { font-size: 11pt; margin-top: 16px; }
    p, li { line-height: 1.45; }
    code {
      background: #f4f4f6;
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 9.5pt;
      font-family: "SFMono-Regular", Consolas, Menlo, monospace;
    }
    pre {
      background: #f7f7f9;
      border: 1px solid #eee;
      border-radius: 4px;
      padding: 10px 12px;
      font-size: 9pt;
      line-height: 1.35;
      page-break-inside: avoid;
    }
    pre code { background: transparent; padding: 0; }
    table {
      border-collapse: collapse;
      font-size: 9.5pt;
      margin: 12px 0;
    }
    th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
    th { background: #fafafa; }
    blockquote {
      border-left: 3px solid #ccc;
      padding: 4px 12px;
      color: #555;
      margin-left: 0;
    }
    a { color: #0366d6; text-decoration: none; }
    hr { border: none; border-top: 1px solid #eee; margin: 20px 0; }
  </style>
`;

async function main() {
  await mkdir(outDir, { recursive: true });
  const entries = await readdir(docsDir, { withFileTypes: true });
  const mdFiles = entries.filter((e) => e.isFile() && e.name.endsWith(".md"));
  if (mdFiles.length === 0) {
    console.log("No markdown docs found in", docsDir);
    return;
  }
  const results = [];
  for (const file of mdFiles) {
    const src = resolve(docsDir, file.name);
    const outName = basename(file.name, ".md") + ".pdf";
    const dest = resolve(outDir, outName);
    process.stdout.write(`• ${file.name} → pdf/${outName} … `);
    const pdf = await mdToPdf(
      { path: src },
      {
        dest,
        stylesheet: [],
        css: stylesheet,
        pdf_options: {
          format: "Letter",
          margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" },
          printBackground: true,
        },
        launch_options: {
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        },
      },
    );
    if (pdf === false) {
      console.log("SKIPPED");
    } else {
      console.log("ok");
      results.push(outName);
    }
  }
  console.log(`\nWrote ${results.length} PDF(s) to docs/pdf/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
