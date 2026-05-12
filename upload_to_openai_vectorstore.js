/**
 * Target FAQ → OpenAI Vector Store uploader
 *
 * This script:
 * 1. Reads the scraped FAQ JSON
 * 2. Converts each FAQ into a plain-text chunk (optimal for RAG)
 * 3. Creates an OpenAI Vector Store
 * 4. Uploads each chunk as a file
 * 5. Attaches the files to the vector store
 * 6. Outputs the vector_store_id to paste into your Realtime agent config
 *
 * Prerequisites:
 *   npm install openai
 *   export OPENAI_API_KEY=sk-...
 *
 * Run:
 *   node upload_to_openai_vectorstore.js
 */

import OpenAI from "openai";
import fs from "fs";
import path from "path";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const FAQ_FILE = process.argv[2] || "./target_faq_knowledge_base.json";
const STORE_NAME = process.argv[3] || "Target FAQ Knowledge Base";

// ── 1. Load FAQ data ──────────────────────────────────────────────────────────
const raw = JSON.parse(fs.readFileSync(FAQ_FILE, "utf-8"));
const faqs = raw.faqs;

console.log(`Loaded ${faqs.length} FAQs across ${raw.metadata.total_categories} categories.\n`);

// ── 2. Convert each FAQ to a plain-text chunk ─────────────────────────────────
// One file per FAQ = fine-grained retrieval (better than one big blob)
const RETAILER = raw.metadata?.retailer || "Target";

function faqToText(faq) {
  return [
    `RETAILER: ${RETAILER}`,
    `CATEGORY: ${faq.category}`,
    `QUESTION: ${faq.question}`,
    `ANSWER: ${faq.answer}`,
    `SOURCE: ${faq.source_url}`,
  ].join("\n");
}

// ── 3. Create the Vector Store ────────────────────────────────────────────────
async function main() {
  console.log("Creating vector store...");
  const vectorStore = await openai.vectorStores.create({
    name: STORE_NAME,
    // Expire after 30 days of inactivity (optional, remove to keep forever)
    expires_after: { anchor: "last_active_at", days: 30 },
  });
  console.log(`✅ Vector store created: ${vectorStore.id}\n`);

  // ── 4. Upload each FAQ as a separate file ─────────────────────────────────
  const fileIds = [];
  for (const faq of faqs) {
    const content = faqToText(faq);

    // OpenAI file upload requires a File-like object
    const blob = new Blob([content], { type: "text/plain" });
    const file = new File([blob], `${faq.id}.txt`, { type: "text/plain" });

    const uploaded = await openai.files.create({
      file,
      purpose: "assistants",
    });
    fileIds.push(uploaded.id);
    process.stdout.write(`  Uploaded ${faq.id} → ${uploaded.id}\n`);
  }

  console.log(`\n✅ ${fileIds.length} files uploaded.\n`);

  // ── 5. Add all files to the vector store in one batch ────────────────────
  console.log("Adding files to vector store (batch)...");
  const batch = await openai.vectorStores.fileBatches.createAndPoll(
    vectorStore.id,
    { file_ids: fileIds }
  );

  console.log(`\n✅ Batch status: ${batch.status}`);
  console.log(`   Files processed: ${batch.file_counts.completed} / ${batch.file_counts.total}`);
  if (batch.file_counts.failed > 0) {
    console.warn(`   ⚠️  ${batch.file_counts.failed} files failed.`);
  }

  // ── 6. Output the config you need ─────────────────────────────────────────
  console.log("\n─────────────────────────────────────────────────────────────");
  console.log("DONE. Use this in your OpenAI Realtime / Assistant config:");
  console.log("");
  console.log(`  vector_store_id = "${vectorStore.id}"`);
  console.log("");
  console.log("For Assistants API, attach via:");
  console.log(`  tool_resources: { file_search: { vector_store_ids: ["${vectorStore.id}"] } }`);
  console.log("");
  console.log("For Realtime API, inject via system prompt (see README below).");
  console.log("─────────────────────────────────────────────────────────────\n");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
