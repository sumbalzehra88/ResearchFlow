import { GoogleGenAI, Type } from "@google/genai";
import * as dotenv from "dotenv";
import { ChatMessage, ContentType, Paper, PaperChunk, Notebook, CitationFidelityResult, Report, ResolvedCitation } from "../src/types";
import { getEmbeddingFromCache, saveEmbeddingToCache } from "./db";

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.warn("WARNING: GEMINI_API_KEY is not set in environment variables.");
}

export const ai = new GoogleGenAI({
  apiKey: API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
    timeout: 120000,
  },
});

export const TEXT_MODEL = "gemini-flash-latest";
export let activeTextModel = "gemini-flash-latest";
const EMBEDDING_MODEL = "gemini-embedding-2-preview";

// Helper function to retry Gemini API calls on transient errors with backoff and model fallback
export async function callWithRetry<T>(
  apiCall: (modelName: string) => Promise<T>,
  primaryModel: string,
  fallbackModel?: string,
  maxRetries = 3
): Promise<T> {
  // If primary model is gemini-flash-latest and we've marked it exhausted, use activeTextModel
  let currentModel = primaryModel === "gemini-flash-latest" ? activeTextModel : primaryModel;
  let delay = 1000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await apiCall(currentModel);
    } catch (error: any) {
      const errStr = (String(error) + " " + JSON.stringify(error)).toLowerCase();
      const isTransient =
        errStr.includes("503") ||
        errStr.includes("500") ||
        errStr.includes("429") ||
        errStr.includes("unavailable") ||
        errStr.includes("resource_exhausted") ||
        errStr.includes("resourceexhausted") ||
        errStr.includes("high demand") ||
        errStr.includes("limit") ||
        errStr.includes("temporary") ||
        errStr.includes("overloaded");

      const isQuotaExhausted =
        errStr.includes("429") ||
        errStr.includes("resource_exhausted") ||
        errStr.includes("resourceexhausted") ||
        errStr.includes("quota");

      if (isQuotaExhausted && currentModel === "gemini-flash-latest") {
        console.warn(`[Gemini API] Quota exhausted for gemini-flash-latest. Dynamically switching global primary to gemini-3.1-flash-lite.`);
        activeTextModel = "gemini-3.1-flash-lite";
      }

      if (!isTransient || attempt === maxRetries) {
        console.error(`[Gemini API] Fatal error with model ${currentModel} on attempt ${attempt}:`, error);
        throw error;
      }

      console.warn(`[Gemini API] Attempt ${attempt} encountered transient error with model ${currentModel}. Retrying...`);

      if (fallbackModel && currentModel !== fallbackModel) {
        console.warn(`[Gemini API] Switching fallback model from ${currentModel} to ${fallbackModel} due to transient error.`);
        currentModel = fallbackModel;
      }

      console.log(`[Gemini API] Retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2; // exponential backoff
    }
  }
  throw new Error("Gemini API call failed after max retries.");
}

// Token tracking and Throttling
export const TOKEN_BUDGET = 500000;
export const usageTotals = {
  prompt: 0,
  output: 0,
  total: 0,
};

let lastCallTime = 0;
const MIN_INTERVAL_MS = 500; // 500ms delay between calls

function throttle(): Promise<void> {
  const elapsed = Date.now() - lastCallTime;
  if (elapsed < MIN_INTERVAL_MS) {
    return new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL_MS - elapsed)).then(() => {
      lastCallTime = Date.now();
    });
  }
  lastCallTime = Date.now();
  return Promise.resolve();
}

function trackUsage(response: any): void {
  if (response.usageMetadata) {
    const prompt = response.usageMetadata.promptTokenCount || 0;
    const output = response.usageMetadata.candidatesTokenCount || 0;
    const total = response.usageMetadata.totalTokenCount || 0;

    usageTotals.prompt += prompt;
    usageTotals.output += output;
    usageTotals.total += total;

    console.log(`[Tokens] This call: prompt=${prompt}, output=${output} | Running Total: ${usageTotals.total} / ${TOKEN_BUDGET}`);

    if (usageTotals.total >= TOKEN_BUDGET) {
      throw new Error(`Token budget of ${TOKEN_BUDGET} reached. Ingestion / Chat operations halted.`);
    }
  }
}

// ---------------------------------------------------------
// 1. Generate Embeddings (with cache)
// ---------------------------------------------------------
export async function getEmbedding(text: string, bypassThrottle = false): Promise<number[]> {
  const cached = getEmbeddingFromCache(text);
  if (cached) return cached;

  if (usageTotals.total >= TOKEN_BUDGET) {
    console.warn(`[Gemini API] Token budget of ${TOKEN_BUDGET} reached. Using zero vector fallback.`);
    return new Array(768).fill(0);
  }

  if (!bypassThrottle) {
    await throttle();
  }

  try {
    const response = await callWithRetry(
      (modelName) =>
        ai.models.embedContent({
          model: modelName,
          contents: text,
        }),
      EMBEDDING_MODEL,
      "text-embedding-004"
    );

    const vector = (response as any).embedding?.values || (response as any).embeddings?.[0]?.values;
    if (!vector) {
      throw new Error("Failed to generate embedding from Gemini API.");
    }

    saveEmbeddingToCache(text, vector);
    return vector;
  } catch (error: any) {
    console.warn(`[Gemini API] Embedding generation failed for text segment, falling back to 768-dim zero vector:`, error.message || error);
    // Return a dummy 768-dimensional zero vector so the application operations (PDF indexing/chat) proceed gracefully
    return new Array(768).fill(0);
  }
}

// ---------------------------------------------------------
// 2. Extract Figures/Tables from PDF using Visual Capability
// ---------------------------------------------------------
export interface ExtractedVisual {
  page: number;
  type: "table" | "chart" | "figure";
  description: string;
}

export async function extractVisualsFromPDF(
  pdfBuffer: Buffer,
  fileName: string
): Promise<ExtractedVisual[]> {
  if (usageTotals.total >= TOKEN_BUDGET) {
    throw new Error(`Token budget of ${TOKEN_BUDGET} reached.`);
  }

  await throttle();
  console.log(`Running visual analysis with Gemini on entire PDF: ${fileName} ...`);

  const response = await callWithRetry(
    (modelName) =>
      ai.models.generateContent({
        model: modelName,
        contents: [
          {
            inlineData: {
              mimeType: "application/pdf",
              data: pdfBuffer.toString("base64"),
            },
          },
          `You are looking at the academic paper "${fileName}".
          Go through the entire PDF. For any page that contains visual elements such as:
          - Architecture diagrams, flowcharts, or schematics
          - Plots, graphs, charts (e.g. attention weight heatmaps, loss curves)
          - Data tables containing quantitative results

          Describe each visual element in full detail so that someone can fully understand it and reason about its contents without looking at the page:
          - For Data Tables: Transcribe them EXACTLY as a Markdown table.
          - For Diagrams/Charts/Plots: Describe the labels, layout, structure, axes, values, trends, and components.
          
          Respond only with a JSON array where each object has these fields:
          - "page" (integer, the 1-indexed page number)
          - "type" (one of "table", "chart", "figure")
          - "description" (detailed markdown string describing the element)

          If there are no visual elements in the entire paper, return an empty array [].`,
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                page: { type: Type.INTEGER },
                type: { type: Type.STRING, description: "Must be 'table', 'chart', or 'figure'" },
                description: { type: Type.STRING },
              },
              required: ["page", "type", "description"],
            },
          },
          temperature: 0.1,
        },
      }),
    TEXT_MODEL,
    "gemini-3.1-flash-lite"
  );

  trackUsage(response);

  try {
    const text = response.text || "[]";
    const parsed = JSON.parse(text) as ExtractedVisual[];
    return parsed;
  } catch (e) {
    console.error("Failed to parse visual elements JSON from Gemini response:", e);
    return [];
  }
}

// ---------------------------------------------------------
// 3. Grounded Chat Generation
// ---------------------------------------------------------
export async function generateChatResponse(
  messages: ChatMessage[],
  retrievedChunks: PaperChunk[],
  papers: Paper[],
  options: { complexity: "plain" | "dense"; jargon: "as-is" | "hover" | "plain-language" }
): Promise<string> {
  if (usageTotals.total >= TOKEN_BUDGET) {
    throw new Error(`Token budget of ${TOKEN_BUDGET} reached.`);
  }

  await throttle();

  // Map context chunks to readable formatting
  const paperMap = new Map(papers.map((p) => [p.id, p.title]));
  const contextText = retrievedChunks
    .map((c, idx) => {
      const title = paperMap.get(c.paperId) || "Unknown Paper";
      return `[Source #${idx + 1}] Paper: "${title}" | Page ${c.page} | Content Type: ${c.contentType.toUpperCase()}\n${c.text}`;
    })
    .join("\n\n---\n\n");

  // Compile list of available cited papers in bibliography
  const bibList: string[] = [];
  papers.forEach((p) => {
    bibList.push(`[Source Paper] "${p.title}" (ID: ${p.id})`);
    if (p.citations) {
      p.citations.forEach((c) => {
        const sourceLevel = c.ingested
          ? "Full Text Ingested (High Confidence)"
          : "Abstract-Only (Low Confidence - verified solely from abstract)";
        bibList.push(`  - Cited Paper: "${c.title}" | Authors: "${c.authors}" | Year: ${c.year || "n.d."} | Ingestion Status: ${sourceLevel}`);
      });
    }
  });
  const bibliographyText = bibList.join("\n");

  // Format system instructions based on style preferences
  let complexityInstruction = "";
  if (options.complexity === "plain") {
    complexityInstruction = "STYLE: Executive Summary Mode. Write in an extremely accessible, clear, and highly scannable format. Structure your answer using neat bullet points, step-by-step breakdowns, and clear bold headings. Keep sentences concise, digestible, and focused on primary takeaways.";
  } else {
    complexityInstruction = "STYLE: Deep Academic Mode. Write in dense, highly rigorous, and formal academic prose suitable for a lead journal investigator or senior peer reviewer. Provide comprehensive, deeply synthesized arguments, describe exact experimental methodologies, and detail any mathematical derivations or formulas mentioned.";
  }

  let jargonInstruction = "";
  if (options.jargon === "plain-language") {
    jargonInstruction = "VOCABULARY: Layman Translation. Avoid advanced technical jargon where possible, translating domain-specific terminology into everyday language and intuitive concepts without losing core precision.";
  } else if (options.jargon === "hover") {
    jargonInstruction = "VOCABULARY: Smart Tooltips. Use specialized advanced terminology naturally, but you MUST wrap key scientific, mathematical, or deep technical terms in a custom HTML tag with a clear definition: <term definition=\"a brief, plain-language definition of the term\">jargon_term</term>. Example: '<term definition=\"the process of calculating gradients to update weights in neural networks\">backpropagation</term>'.";
  } else {
    jargonInstruction = "VOCABULARY: Academic Rigor. Use original academic and specialized scientific jargon naturally without any additional inline translations, explanations, or wrappers.";
  }

  const systemInstruction = `You are an elite Research Paper Deep-Research Assistant.
  You answer user questions by grounding your reasoning strictly in the provided paper context and references bibliography.

  RULES:
  1. Grounded Generation: Base your answer ONLY on the provided Context. If the context does not contain enough information to answer, say so clearly. Do not make up facts.
  2. Formatting: Use clear Markdown. When citing or referring to a source chunk, use its source number inside a superscript brackets inline, like [Source #1] or multiple like [Source #1, Source #3].
  3. Strict constraint: DO NOT use any emojis in your response. No icons, no smiley faces, no sparkle emojis, ever.
  4. Separate Citation Findings: When you draw on or discuss any resolved citation/reference in your response, you MUST keep the source paper's claim and the cited paper's actual findings/findings from its abstract/metadata visibly separate (e.g. write "the source paper states X; however, [Author et al.] actually found Y"). Never blend them into a single voice.
  5. Ingestion Confidence Warning: Clearly warn the user whenever a cited paper's reference is "Abstract-Only", stating that its findings are verified solely from abstract metadata because the full text was not available for ingestion.
  6. Mathematical Equations First: Whenever the user asks for, mentions, or queries a mathematical equation, formula, derivation, calculation, or system of math, you MUST construct and output the complete math equation or system of equations using KaTeX block syntax ($$ ... $$) at the VERY BEGINNING of your response before any text, and then provide the rest of your answer or explanation afterwards.
  7. Figure & Diagram Illustrations First: Whenever the user refers to, asks about, or mentions a figure, schematic, diagram, architecture, or visual layout, you MUST generate a high-fidelity visual flowchart, block diagram, or conceptual illustration using a Mermaid markdown code block (\`\`\`mermaid ... \`\`\`) at the VERY BEGINNING of your response before any text, illustrating the system components, data flow, or logical steps of the figure. IMPORTANT: ALWAYS enclose text labels in node definitions in double quotes to avoid syntax errors with parentheses or special characters, for example: write A["Encoder Stack (N = 6 Layers)"] instead of A[Encoder Stack (N = 6 Layers)] or B("Input (Vector)") instead of B(Input (Vector)). Then provide the rest of your detailed explanation afterwards.

  ${complexityInstruction}
  ${jargonInstruction}

  Available Bibliography:
  ${bibliographyText}

  Context Chunks:
  ${contextText}`;

  // Use the last 5 messages as history
  const recentHistory = messages.slice(-5).map((m) => ({
    role: m.role === "user" ? "user" as const : "model" as const,
    parts: [{ text: m.text }],
  }));

  const response = await callWithRetry(
    (modelName) =>
      ai.models.generateContent({
        model: modelName,
        contents: [
          ...recentHistory,
          { role: "user", parts: [{ text: messages[messages.length - 1].text }] },
        ],
        config: {
          systemInstruction,
          temperature: 0.2,
        },
      }),
    TEXT_MODEL,
    "gemini-3.1-flash-lite"
  );

  trackUsage(response);
  return response.text || "I was unable to formulate a grounded response.";
}

// ---------------------------------------------------------
// 4. Citation Fidelity Checking
// ---------------------------------------------------------
export async function performFidelityChecks(
  originalPaperTitle: string,
  originalPaperTextSample: string,
  citedPaperTitle: string,
  citedPaperAbstract: string
): Promise<Partial<CitationFidelityResult>> {
  if (usageTotals.total >= TOKEN_BUDGET) {
    throw new Error(`Token budget of ${TOKEN_BUDGET} reached.`);
  }

  await throttle();

  const prompt = `You are a scientific fact-checker. We have a paper "${originalPaperTitle}" which makes certain claims citing "${citedPaperTitle}".
  
  Below is a text sample from the original paper making the citation:
  """
  ${originalPaperTextSample}
  """

  And here is the abstract/text of the cited paper "${citedPaperTitle}":
  """
  ${citedPaperAbstract}
  """

  Your job is to verify whether the cited paper's abstract ACTUALLY supports the claim made in the original paper.
  Classify the citation fidelity as exactly one of:
  - "Supported" (the cited paper fully verifies the claim)
  - "Partially supported" (the cited paper touches on it but doesn't fully back the specific claims, or is weak/limited)
  - "Unsupported" (the cited paper's content contradicts or has nothing to do with the claim)
  - "Unverifiable" (the cited paper text is too brief/missing to confidently confirm)

  CONSERVATIVENESS RULE: You MUST be extremely conservative. If the cited paper's abstract or findings do not explicitly, directly, and unambiguously support the claim made in the original paper, or if there is ANY ambiguity, mismatch, lack of detail, or missing context in the cited text, you MUST default to "Unverifiable". Never guess, assume, extrapolate, or give the benefit of the doubt. A confident-sounding wrong classification is worse than an honest "Unverifiable", as it completely destroys user trust in our verification engine.

  If you classify the status as "Partially supported" or "Unsupported", you MUST identify a "divergence_type" describing how the cited paper's content diverges from the claim. It MUST be exactly one of:
  - "overgeneralization" (the claim extends findings to a broader population/context than supported)
  - "scope_drift" (the claim discusses a different focus/topic than the cited research)
  - "temporal_drift" (the claim assumes past findings apply to a different or current timeline incorrectly)
  - "causal_overreach" (the claim asserts a causal link when only correlation or separate findings exist)
  - "other" (any other form of divergence)
  
  If "divergence_type" is provided, you should also provide a very brief "divergence_description" (maximum 1 sentence, e.g., "The claim assumes past findings apply to modern hardware architectures").
  If the status is "Supported" or "Unverifiable", do not provide "divergence_type" or "divergence_description" (they can be null).

  Provide a concise, 1-line justification (maximum 2 sentences) describing why this classification was made. Do not use any emojis.

  Respond only in JSON format with these keys:
  - "status": "Supported" | "Partially supported" | "Unsupported" | "Unverifiable"
  - "justification": string
  - "divergence_type": "overgeneralization" | "scope_drift" | "temporal_drift" | "causal_overreach" | "other" | null
  - "divergence_description": string | null
  `;

  const response = await callWithRetry(
    (modelName) =>
      ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              status: { type: Type.STRING, description: "Supported, Partially supported, Unsupported, or Unverifiable" },
              justification: { type: Type.STRING },
              divergence_type: { type: Type.STRING, enum: ["overgeneralization", "scope_drift", "temporal_drift", "causal_overreach", "other"], description: "Only if Partially supported or Unsupported" },
              divergence_description: { type: Type.STRING, description: "A very short description explaining the divergence" },
            },
            required: ["status", "justification"],
          },
          temperature: 0.1,
        },
      }),
    TEXT_MODEL,
    "gemini-3.1-flash-lite"
  );

  trackUsage(response);

  try {
    const parsed = JSON.parse(response.text || "{}");
    return parsed;
  } catch (e) {
    return {
      status: "Unverifiable",
      justification: "Failed to parse fact-checking model response.",
    };
  }
}

// ---------------------------------------------------------
// 5. Grounded Report Generation
// ---------------------------------------------------------
export async function generateGroundedReport(
  prompt: string,
  templateType: "executive_summary" | "literature_review" | "methods_critique" | "full_report",
  chunks: PaperChunk[],
  papers: { id: string; title: string; authors?: string; year?: number; isAbstractOnly?: boolean }[],
  options: { complexity: "plain" | "dense"; jargon: "as-is" | "hover" | "plain-language" }
): Promise<{ content: string; references: Report["references"] }> {
  if (usageTotals.total >= TOKEN_BUDGET) {
    throw new Error("Token budget of " + TOKEN_BUDGET + " reached.");
  }

  await throttle();

  const paperMap = new Map(papers.map((p) => [p.id, p.title]));
  const contextText = chunks
    .map((c, idx) => {
      const title = paperMap.get(c.paperId) || "Unknown Paper";
      return `[Chunk #${idx + 1}] Paper: "${title}" | Page ${c.page} | Content Type: ${c.contentType}\n${c.text}`;
    })
    .join("\n\n---\n\n");

  const bibliographyText = papers
    .map((p, idx) => {
      const label = `[${idx + 1}]`;
      const sourceLevel = p.isAbstractOnly
        ? "Abstract-Only (Confidence level: Low - based solely on abstract)"
        : "Full Text Ingested (Confidence level: High - fully verified)";
      return `${label}: Title: "${p.title}" | Authors: "${p.authors || "Unknown"}" | Year: ${p.year || "n.d."} | Ingestion Level: ${sourceLevel}`;
    })
    .join("\n");

  let templateInstructions = "";
  switch (templateType) {
    case "executive_summary":
      templateInstructions = "Produce a concise, high-level Executive Summary focusing on core findings, business/research impact, and summary metrics.";
      break;
    case "literature_review":
      templateInstructions = "Produce a comprehensive Literature Review showing how these papers compare, cross-reference, overlap, or contradict each other.";
      break;
    case "methods_critique":
      templateInstructions = "Produce a detailed Methods Critique evaluating the methodology, datasets, training details, mathematical logic, and validity of each paper.";
      break;
    case "full_report":
      templateInstructions = "Produce a highly comprehensive, multi-section Full Report including background, methodologies, key findings, and a deep discussion.";
      break;
  }

  let complexityInstruction = "";
  if (options.complexity === "plain") {
    complexityInstruction = "Write in accessible, clear, and easy-to-understand language. Avoid unnecessarily complex syntactic loops.";
  } else {
    complexityInstruction = "Write in highly dense, academic prose matching prestigious journals (e.g., Nature, IEEE, ACM). Use rigorous syntax.";
  }

  let jargonInstruction = "";
  if (options.jargon === "plain-language") {
    jargonInstruction = "Explain specialized terms in plain language where possible, preserving academic correctness.";
  } else if (options.jargon === "hover") {
    jargonInstruction = "Embed specialized terminology wrapped inside <term definition=\"...\">term</term> tags so they can be interactive on the frontend.";
  } else {
    jargonInstruction = "Use native specialized academic jargon without extra explanations.";
  }

  const systemInstruction = `You are a distinguished Senior Research Fellow. You generate exceptionally high-quality academic reports grounded strictly in the provided paper chunks and reference bibliography.

  INSTRUCTIONS:
  1. Grounded Content: Your report content must ONLY draw from the provided chunks.
  2. Citation Fidelity: You MUST cite papers strictly using their assigned bracket keys (e.g. [1], [2]) matching the Available Bibliography list below.
  3. No Emojis: Absolutely NO emojis or icons of any kind.
  4. Structured sections: Use professional headings (no numeric indices unless requested).
  5. Separate Findings Constraint: When discussing any cited finding, you MUST keep the source paper's claim and the cited paper's actual finding visibly separate (e.g. "the source paper states X; however, [Author et al.] found Y"). Never blend them into a single voice.
  6. Confidence Level Warning: If a paper in the Bibliography is marked as "Abstract-Only", you MUST explicitly state in the body text that your verification of its findings is limited to its abstract metadata (e.g. "Note: [1] is an Abstract-Only citation, restrict confidence accordingly").
  7. References Section: At the very end, include a "References" section listing all papers actually referenced.
  
  ${templateInstructions}
  ${complexityInstruction}
  ${jargonInstruction}

  Available Bibliography:
  ${bibliographyText}

  Context Chunks:
  ${contextText}

  Report Prompt:
  ${prompt}`;

  const response = await callWithRetry(
    (modelName) =>
      ai.models.generateContent({
        model: modelName,
        contents: "Write the report based on your system instructions and the provided chunks.",
        config: {
          systemInstruction,
          temperature: 0.2,
        },
      }),
    TEXT_MODEL,
    "gemini-3.1-flash-lite"
  );

  trackUsage(response);

  // Parse references out or build them
  const content = response.text || "Failed to generate report.";
  
  // Create reference objects matching the actual bibliography provided to the AI
  const references: Report["references"] = papers.map((p, idx) => ({
    citationKey: `[${idx + 1}]`,
    title: p.title,
    authors: p.authors || "Unknown Authors",
    year: p.year || 2026,
  }));

  return {
    content,
    references,
  };
}
