import * as fs from "fs";
import * as path from "path";
import { Notebook, PaperChunk, CitationFidelityResult, ResolvedCitation } from "../src/types";

const isVercel = process.env.VERCEL === "1" || !!process.env.VERCEL;
export const DATA_DIR = isVercel ? path.join("/tmp", "data") : path.join(process.cwd(), "data");

function copyFolderSync(from: string, to: string) {
  if (!fs.existsSync(from)) return;
  if (!fs.existsSync(to)) {
    fs.mkdirSync(to, { recursive: true });
  }
  const elements = fs.readdirSync(from);
  for (const element of elements) {
    const fromPath = path.join(from, element);
    const toPath = path.join(to, element);
    if (fs.lstatSync(fromPath).isDirectory()) {
      copyFolderSync(fromPath, toPath);
    } else if (!fs.existsSync(toPath)) {
      fs.copyFileSync(fromPath, toPath);
    }
  }
}

// Create data directory if it doesn't exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Clone workspace data/ assets to /tmp/data/ at startup on Vercel
if (isVercel) {
  const workspaceDataDir = path.join(process.cwd(), "data");
  try {
    copyFolderSync(workspaceDataDir, DATA_DIR);
    console.log("[Vercel DB Init] Cloned data assets successfully to /tmp/data");
  } catch (err: any) {
    console.error("[Vercel DB Init] Error cloning data assets:", err.message);
  }
}

const NOTEBOOKS_FILE = path.join(DATA_DIR, "notebooks.json");
const EMBEDDINGS_CACHE_FILE = path.join(DATA_DIR, "embeddings_cache.json");
const VISUALS_CACHE_FILE = path.join(DATA_DIR, "visuals_cache.json");
const CHUNKS_FILE = path.join(DATA_DIR, "chunks.json");
const CITATION_CACHE_FILE = path.join(DATA_DIR, "citation_cache.json");
const RETRACTIONS_CACHE_FILE = path.join(DATA_DIR, "retractions_cache.json");

// Generic helper to read JSON file safely
function readJSON<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(content) as T;
    }
  } catch (error) {
    console.error(`Error reading database file ${filePath}:`, error);
  }
  return defaultValue;
}

// Generic helper to write JSON file safely
function writeJSON<T>(filePath: string, data: T): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {
    console.error(`Error writing database file ${filePath}:`, error);
  }
}

// ---------------------------------------------------------
// Notebooks Management
// ---------------------------------------------------------
export function getNotebooks(): Notebook[] {
  return readJSON<Notebook[]>(NOTEBOOKS_FILE, []);
}

export function saveNotebooks(notebooks: Notebook[]): void {
  writeJSON(NOTEBOOKS_FILE, notebooks);
}

export function getNotebook(id: string): Notebook | undefined {
  const notebooks = getNotebooks();
  return notebooks.find((n) => n.id === id);
}

export function saveNotebook(notebook: Notebook): void {
  const notebooks = getNotebooks();
  const index = notebooks.findIndex((n) => n.id === notebook.id);
  if (index !== -1) {
    notebooks[index] = notebook;
  } else {
    notebooks.push(notebook);
  }
  saveNotebooks(notebooks);
}

// ---------------------------------------------------------
// Chunks (Vector Store Cache)
// ---------------------------------------------------------
interface PaperChunkWithVector extends PaperChunk {
  vector: number[];
}

export function getPaperChunksWithVectors(paperId: string): PaperChunkWithVector[] {
  const allChunks = readJSON<Record<string, PaperChunkWithVector[]>>(CHUNKS_FILE, {});
  return allChunks[paperId] || [];
}

export function savePaperChunksWithVectors(paperId: string, chunks: PaperChunkWithVector[]): void {
  const allChunks = readJSON<Record<string, PaperChunkWithVector[]>>(CHUNKS_FILE, {});
  allChunks[paperId] = chunks;
  writeJSON(CHUNKS_FILE, allChunks);
}

// ---------------------------------------------------------
// Embeddings Cache
// ---------------------------------------------------------
export function getEmbeddingFromCache(text: string): number[] | null {
  const cache = readJSON<Record<string, number[]>>(EMBEDDINGS_CACHE_FILE, {});
  return cache[text] || null;
}

export function saveEmbeddingToCache(text: string, vector: number[]): void {
  const cache = readJSON<Record<string, number[]>>(EMBEDDINGS_CACHE_FILE, {});
  cache[text] = vector;
  writeJSON(EMBEDDINGS_CACHE_FILE, cache);
}

// ---------------------------------------------------------
// Visuals (Gemini Vision Description) Cache
// Key: paperId_pageNumber -> description text
// ---------------------------------------------------------
export function getVisualDescriptionFromCache(paperId: string, page: number): string | null {
  const cache = readJSON<Record<string, string>>(VISUALS_CACHE_FILE, {});
  const key = `${paperId}_${page}`;
  return cache[key] || null;
}

export function saveVisualDescriptionToCache(paperId: string, page: number, description: string): void {
  const cache = readJSON<Record<string, string>>(VISUALS_CACHE_FILE, {});
  const key = `${paperId}_${page}`;
  cache[key] = description;
  writeJSON(VISUALS_CACHE_FILE, cache);
}

// ---------------------------------------------------------
// Citation Search / Resolving Cache
// ---------------------------------------------------------
export function getCitationFromCache(query: string): any | null {
  const cache = readJSON<Record<string, any>>(CITATION_CACHE_FILE, {});
  return cache[query] || null;
}

export function saveCitationToCache(query: string, result: any): void {
  const cache = readJSON<Record<string, any>>(CITATION_CACHE_FILE, {});
  cache[query] = result;
  writeJSON(CITATION_CACHE_FILE, cache);
}

// ---------------------------------------------------------
// Retraction Cache
// ---------------------------------------------------------
export function getRetractionFromCache(key: string): boolean | null {
  const cache = readJSON<Record<string, boolean>>(RETRACTIONS_CACHE_FILE, {});
  return cache[key] !== undefined ? cache[key] : null;
}

export function saveRetractionToCache(key: string, isRetracted: boolean): void {
  const cache = readJSON<Record<string, boolean>>(RETRACTIONS_CACHE_FILE, {});
  cache[key] = isRetracted;
  writeJSON(RETRACTIONS_CACHE_FILE, cache);
}
