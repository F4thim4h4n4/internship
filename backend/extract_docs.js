'use strict';

/**
 * extract_docs.js — Document text extraction utility
 *
 * Extracts raw text from SRS (.docx) and architecture PDFs for processing.
 * Output files are written alongside this script in the backend/ directory.
 *
 * Usage (from the project root):
 *   node backend/extract_docs.js
 */

const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

// ── Path helpers ────────────────────────────────────────────────────────────
// Resolve all paths relative to the project root so this script works on any
// developer machine, regardless of where the repo is cloned.
const PROJECT_ROOT = path.resolve(__dirname, '..');

function docPath(...segments) {
  return path.join(PROJECT_ROOT, 'docs', ...segments);
}

// ── Document map ─────────────────────────────────────────────────────────────
const DOCS = {
  srs: docPath('srs', 'SRS_AI_Powered_Municipality_Management_Portal_Updated.docx'),
  database: docPath(
    '04-Database-Architecture',
    'SmartCity_DB_Architecture_v4.0_AI_Extension_Updated.md'
  ),
  security: docPath(
    '03-Security-Architecture',
    'Security_Access_Control_Architecture_Document.md'
  ),
  ui: docPath('06-UI-Architecture', 'Frontend_Architecture_Final_Merged_Updated.pdf'),
  ai: docPath('07-AI-Architecture', 'AI_Architecture_Final_Submission_Updated.pdf'),
};

// ── Extractors ────────────────────────────────────────────────────────────────
async function extractDocx(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

async function extractPdf(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdf(dataBuffer);
  return data.text;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('--- Extracting SRS Docx ---');
  try {
    const srsText = await extractDocx(DOCS.srs);
    fs.writeFileSync(path.join(__dirname, 'srs_text.txt'), srsText);
    console.log('SRS extracted successfully, length:', srsText.length);
  } catch (e) {
    console.error('SRS failed:', e.message);
  }

  console.log('--- Extracting UI Architecture PDF ---');
  try {
    const uiText = await extractPdf(DOCS.ui);
    fs.writeFileSync(path.join(__dirname, 'ui_text.txt'), uiText);
    console.log('UI Architecture extracted successfully, length:', uiText.length);
  } catch (e) {
    console.error('UI failed:', e.message);
  }

  console.log('--- Extracting AI Architecture PDF ---');
  try {
    const aiText = await extractPdf(DOCS.ai);
    fs.writeFileSync(path.join(__dirname, 'ai_text.txt'), aiText);
    console.log('AI Architecture extracted successfully, length:', aiText.length);
  } catch (e) {
    console.error('AI failed:', e.message);
  }
}

main();
