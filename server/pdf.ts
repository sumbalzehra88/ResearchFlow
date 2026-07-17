import * as fs from "fs";
import * as path from "path";
import { PDFParse } from "pdf-parse";
import { ContentType, PaperChunk } from "../src/types";
import { getEmbedding, extractVisualsFromPDF } from "./gemini";
import { getPaperChunksWithVectors, savePaperChunksWithVectors, getVisualDescriptionFromCache, saveVisualDescriptionToCache, DATA_DIR } from "./db";

const HEADING_FONT_THRESHOLD = 11.5;

interface ExtractedPage {
  pageNumber: number;
  text: string;
  headings: string[];
}

function extractHeadingsFromText(text: string): string[] {
  const headings: string[] = [];
  const commonSectionNames = [
    "introduction",
    "related work",
    "background",
    "methodology",
    "proposed method",
    "methods",
    "experiments",
    "experimental setup",
    "results",
    "discussion",
    "conclusion",
    "references",
    "abstract",
    "acknowledgments"
  ];

  for (const name of commonSectionNames) {
    const regex = new RegExp(`(?:\\b(?:[1-9]\\d*(?:\\.[1-9]\\d*)*|I[VX]|V?I{0,3})\\.?\\s+)?\\b${name}\\b`, "i");
    const match = text.match(regex);
    if (match) {
      headings.push(match[0].trim());
    }
  }
  return Array.from(new Set(headings));
}

export async function processPDF(
  pdfBuffer: Buffer,
  paperId: string,
  fileName: string
): Promise<number> {
  // Ensure we save the PDF file to disk for iframe/rendering use
  const pdfsDir = path.join(DATA_DIR, "pdfs");
  if (!fs.existsSync(pdfsDir)) {
    fs.mkdirSync(pdfsDir, { recursive: true });
  }
  const pdfPath = path.join(pdfsDir, `${paperId}.pdf`);
  fs.writeFileSync(pdfPath, pdfBuffer);
  console.log(`[PDF Save] Saved raw PDF to ${pdfPath}`);

  // Check if we already have indexed chunks for this paper
  const existing = getPaperChunksWithVectors(paperId);
  if (existing.length > 0) {
    console.log(`[Cache Hit] Paper ${paperId} is already ingested.`);
    const maxPage = existing.reduce((max, c) => Math.max(max, c.page || 1), 1);
    return maxPage;
  }

  console.log(`Parsing PDF text and layout for: ${fileName}...`);

  const pages: ExtractedPage[] = [];

  // Instantiate mehmet-kozan's pdf-parse class and extract text
  const parser = new PDFParse({ data: pdfBuffer });
  const result = await parser.getText();

  for (const page of result.pages) {
    const pageText = page.text || "";
    const headings = extractHeadingsFromText(pageText);

    pages.push({
      pageNumber: page.num,
      text: pageText,
      headings: headings,
    });
  }

  // Sort pages numerically
  pages.sort((a, b) => a.pageNumber - b.pageNumber);

  const documentChunks: any[] = [];

  // 1. Process Headings as separate chunks
  for (const p of pages) {
    for (const h of p.headings) {
      if (h.length > 3) {
        documentChunks.push({
          id: `${paperId}_p${p.pageNumber}_h_${Math.random().toString(36).substr(2, 9)}`,
          paperId,
          page: p.pageNumber,
          contentType: ContentType.HEADING,
          text: h,
        });
      }
    }
  }

  // 2. Split body text of each page into chunks
  for (const p of pages) {
    if (p.text.length < 10) continue;

    const textChunks = splitTextIntoChunks(p.text, 500, 50);
    for (let i = 0; i < textChunks.length; i++) {
      documentChunks.push({
        id: `${paperId}_p${p.pageNumber}_t_${i}`,
        paperId,
        page: p.pageNumber,
        contentType: ContentType.TEXT,
        text: textChunks[i],
      });
    }
  }

  // 3. Extract tables / charts / diagrams via Gemini visual capabilities
  try {
    const visuals = await extractVisualsFromPDF(pdfBuffer, fileName);
    for (const vis of visuals) {
      documentChunks.push({
        id: `${paperId}_p${vis.page}_v_${Math.random().toString(36).substr(2, 9)}`,
        paperId,
        page: vis.page,
        contentType: vis.type as ContentType,
        text: vis.description,
      });
      // Cache it
      saveVisualDescriptionToCache(paperId, vis.page, vis.description);
    }
  } catch (error) {
    console.error(`Visual extraction failed for ${fileName} (falling back to text-only):`, error);
  }

  // 4. Generate embeddings for all extracted chunks (vector store index) in parallel batches
  console.log(`Generating embeddings for ${documentChunks.length} chunks of "${fileName}"...`);
  const finalChunksWithVectors: any[] = [];
  let completed = 0;
  const CONCURRENCY = 5;

  for (let i = 0; i < documentChunks.length; i += CONCURRENCY) {
    const batch = documentChunks.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (chunk) => {
        try {
          // Bypass global sequential throttle for embeddings
          const vector = await getEmbedding(chunk.text, true);
          finalChunksWithVectors.push({
            ...chunk,
            vector,
          });
        } catch (err: any) {
          console.error(`Failed to generate embedding for chunk: ${chunk.id}`, err);
        } finally {
          completed++;
          if (completed % 20 === 0 || completed === documentChunks.length) {
            console.log(`  Indexed ${completed}/${documentChunks.length} chunks...`);
          }
        }
      })
    );
    // Add a tiny delay between batches to respect free-tier rate limits (100 RPM)
    if (i + CONCURRENCY < documentChunks.length) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  // Save index
  savePaperChunksWithVectors(paperId, finalChunksWithVectors);
  console.log(`Ingested "${fileName}" successfully: ${finalChunksWithVectors.length} chunks stored.`);
  return pages.length;
}

/**
 * Splits standard page text into chunks of specified size and overlap.
 */
function splitTextIntoChunks(text: string, chunkSize = 500, chunkOverlap = 50): string[] {
  const chunks: string[] = [];
  let startIndex = 0;

  while (startIndex < text.length) {
    let endIndex = startIndex + chunkSize;

    // Search for a sentence end or newline in the window to make cleaner splits
    if (endIndex < text.length) {
      const searchWindow = text.substring(endIndex - 100, endIndex + 50);
      const lastPeriod = searchWindow.lastIndexOf(".");
      const lastNewline = searchWindow.lastIndexOf("\n");

      const bestSplit = Math.max(lastPeriod, lastNewline);
      if (bestSplit !== -1) {
        endIndex = endIndex - 100 + bestSplit + 1;
      }
    }

    chunks.push(text.substring(startIndex, endIndex).trim());
    startIndex = endIndex - chunkOverlap;
    if (startIndex < 0) startIndex = 0;

    if (endIndex >= text.length) break;
  }

  return chunks.filter((c) => c.length > 10);
}

// Simple Vector & Hybrid BM25 Search Engine
export function retrieveChunks(
  query: string,
  queryVector: number[],
  paperIds: string[],
  k = 6
): PaperChunk[] {
  const allCandidateChunks: { chunk: PaperChunk; score: number }[] = [];

  for (const paperId of paperIds) {
    const chunksWithVectors = getPaperChunksWithVectors(paperId);

    for (const chunk of chunksWithVectors) {
      // 1. Dense (Cosine Similarity) Score
      const denseScore = cosineSimilarity(queryVector, chunk.vector);

      // 2. Sparse (BM25/TF-IDF) Score
      const sparseScore = computeKeywordScore(query, chunk.text);

      // Ensemble Retrieval (0.3 sparse + 0.7 dense)
      const ensembleScore = 0.3 * sparseScore + 0.7 * denseScore;

      allCandidateChunks.push({
        chunk: {
          id: chunk.id,
          paperId: chunk.paperId,
          page: chunk.page,
          contentType: chunk.contentType,
          text: chunk.text,
        },
        score: ensembleScore,
      });
    }
  }

  // Sort by highest score first
  allCandidateChunks.sort((a, b) => b.score - a.score);

  return allCandidateChunks.slice(0, k).map((item) => item.chunk);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function computeKeywordScore(query: string, text: string): number {
  const queryTerms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
  const textLower = text.toLowerCase();
  if (queryTerms.length === 0) return 0;

  let hits = 0;
  for (const term of queryTerms) {
    if (textLower.includes(term)) {
      hits++;
    }
  }

  return hits / queryTerms.length;
}
