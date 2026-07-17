import express from "express";
import path from "path";
import * as fs from "fs";
import multer from "multer";
import axios from "axios";
import {
  getNotebooks,
  saveNotebooks,
  getNotebook,
  saveNotebook,
  getPaperChunksWithVectors,
  DATA_DIR,
} from "./server/db";
import { processPDF, retrieveChunks } from "./server/pdf";
import {
  getEmbedding,
  generateChatResponse,
  performFidelityChecks,
  generateGroundedReport,
  usageTotals,
  TOKEN_BUDGET,
} from "./server/gemini";
import {
  extractCitationsList,
  resolveCitationOnSemanticScholar,
  ingestOpenAccessPdf,
  extractCitationsFromBibliography,
  getBibliographyText,
  checkRetractionStatus,
} from "./server/citations";
import { Notebook, Paper, ChatMessage, AuditTrailEntry, CitationFidelityResult, Report, ContentType, ResolvedCitation, PaperChunk } from "./src/types";

async function downloadPreloadedPapers() {
  const pdfsDir = path.join(DATA_DIR, "pdfs");
  if (!fs.existsSync(pdfsDir)) {
    fs.mkdirSync(pdfsDir, { recursive: true });
  }
  const preloadedPdfPath = path.join(pdfsDir, "paper_xqnivujr7.pdf");
  if (!fs.existsSync(preloadedPdfPath)) {
    console.log("[Init] Downloading preloaded PDF 'attention_is_all_you_need.pdf' from Arxiv...");
    try {
      const response = await axios.get("https://arxiv.org/pdf/1706.03762.pdf", {
        responseType: "arraybuffer",
        timeout: 20000,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
      });
      fs.writeFileSync(preloadedPdfPath, Buffer.from(response.data));
      console.log("[Init] Preloaded PDF downloaded successfully!");
    } catch (err: any) {
      console.error("[Init] Failed to download preloaded PDF:", err.message);
    }
  }
}

// downloadPreloadedPapers is called inside startServer() below

const app = express();
const PORT = 3000;

// JSON and UrlEncoded parsers
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Multer config for file uploads in memory
const upload = multer({ storage: multer.memoryStorage() });

  // ---------------------------------------------------------
  // API Routes
  // ---------------------------------------------------------

  // 1. Get Token usage and system health
  app.get("/api/tokens", (req, res) => {
    res.json({
      used: usageTotals.total,
      budget: TOKEN_BUDGET,
      prompt: usageTotals.prompt,
      output: usageTotals.output,
    });
  });

  // 2. Get all notebooks
  app.get("/api/notebooks", (req, res) => {
    try {
      res.json(getNotebooks());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Create a new notebook
  app.post("/api/notebooks", (req, res) => {
    try {
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Notebook name is required" });
      }

      const newNotebook: Notebook = {
        id: `nb_${Math.random().toString(36).substr(2, 9)}`,
        name,
        createdAt: new Date().toISOString(),
        papers: [],
        chatHistory: [],
        auditTrail: [],
        reports: [],
        fidelityResults: [],
      };

      saveNotebook(newNotebook);
      res.status(201).json(newNotebook);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Get notebook detail
  app.get("/api/notebooks/:id", (req, res) => {
    try {
      const notebook = getNotebook(req.params.id);
      if (!notebook) {
        return res.status(404).json({ error: "Notebook not found" });
      }
      res.json(notebook);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. Delete notebook
  app.delete("/api/notebooks/:id", (req, res) => {
    try {
      const notebooks = getNotebooks();
      const filtered = notebooks.filter((n) => n.id !== req.params.id);
      saveNotebooks(filtered);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 6. Upload Paper PDF to Notebook
  app.post("/api/notebooks/:id/upload", upload.single("pdf"), async (req, res) => {
    try {
      const notebook = getNotebook(req.params.id);
      if (!notebook) {
        return res.status(404).json({ error: "Notebook not found" });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "No PDF file uploaded" });
      }

      const paperId = `paper_${Math.random().toString(36).substr(2, 9)}`;
      const fileName = file.originalname;

      // Extract a clean title (default to filename minus .pdf)
      const cleanTitle = fileName.replace(/\.pdf$/i, "").replace(/_/g, " ");

      // Run PDF processing (parsing, chunking, Gemini visual extraction, embedding, caching)
      const totalPages = await processPDF(file.buffer, paperId, fileName);

      // Extract baseline citations immediately (zero external API calls!)
      let baselineCitations: ResolvedCitation[] = [];
      try {
        const chunks = getPaperChunksWithVectors(paperId);
        const bibText = getBibliographyText(chunks);
        console.log(`[Upload] Extracted bibliography text length: ${bibText.length}. Running baseline extraction...`);
        const extractedBib = await extractCitationsFromBibliography(cleanTitle, bibText);
        console.log(`[Upload] Extracted ${extractedBib.length} baseline references.`);

        baselineCitations = extractedBib.map((ref) => ({
          id: `cited_${Math.random().toString(36).substr(2, 9)}`,
          title: ref.title,
          authors: ref.authors,
          year: ref.year,
          hopDepth: 1,
          status: "pending",
          citationKey: ref.citationKey,
        }));
      } catch (bibErr) {
        console.error("Failed to extract baseline citations on upload:", bibErr);
      }

      const newPaper: Paper = {
        id: paperId,
        title: cleanTitle,
        filename: fileName,
        totalPages,
        uploadedAt: new Date().toISOString(),
        citationResolved: false,
        citations: baselineCitations,
      };

      // Add paper to notebook
      notebook.papers.push(newPaper);

      saveNotebook(notebook);
      res.status(201).json({ paper: newPaper, notebook });
    } catch (err: any) {
      console.error("PDF upload/processing error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 7. Grounded Chat Endpoint
  app.post("/api/notebooks/:id/chat", async (req, res) => {
    try {
      const notebook = getNotebook(req.params.id);
      if (!notebook) {
        return res.status(404).json({ error: "Notebook not found" });
      }

      const { prompt, paperIds, complexity = "plain", jargon = "as-is" } = req.body;
      if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
      }

      // If specific paperIds are provided, scope search to those. Otherwise, query all papers in notebook.
      const targetPaperIds = paperIds && paperIds.length > 0
        ? paperIds
        : notebook.papers.map((p) => p.id);

      if (targetPaperIds.length === 0) {
        return res.status(400).json({ error: "No papers available in the notebook to chat with. Please upload a PDF first." });
      }

      // Generate embedding for user query
      console.log(`Generating embedding for user chat query: "${prompt}"...`);
      const queryVector = await getEmbedding(prompt);

      // Retrieve top chunks across target papers (hybrid dense/sparse retrieval)
      const retrievedChunks = retrieveChunks(prompt, queryVector, targetPaperIds, 6);

      // Build chat histories
      const userMsg: ChatMessage = {
        id: `msg_${Math.random().toString(36).substr(2, 9)}`,
        role: "user",
        text: prompt,
        timestamp: new Date().toISOString(),
        complexity,
        jargon,
      };

      notebook.chatHistory.push(userMsg);

      // Generate response from Gemini
      const answerText = await generateChatResponse(
        notebook.chatHistory,
        retrievedChunks,
        notebook.papers,
        { complexity, jargon }
      );

      // Map retrieved chunks to inline sources
      const paperMap = new Map(notebook.papers.map((p) => [p.id, p.title]));
      const sources = retrievedChunks.map((c) => ({
        paperId: c.paperId,
        paperTitle: paperMap.get(c.paperId) || "Paper",
        page: c.page,
        contentType: c.contentType,
        text: c.text,
      }));

      const assistantMsg: ChatMessage = {
        id: `msg_${Math.random().toString(36).substr(2, 9)}`,
        role: "assistant",
        text: answerText,
        timestamp: new Date().toISOString(),
        sources,
        complexity,
        jargon,
      };

      notebook.chatHistory.push(assistantMsg);

      saveNotebook(notebook);
      res.json({ message: assistantMsg, notebook });
    } catch (err: any) {
      console.error("Chat generation error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 8. Resolve Paper Citations using Semantic Scholar
  app.post("/api/notebooks/:id/papers/:paperId/resolve-citations", async (req, res) => {
    try {
      const notebook = getNotebook(req.params.id);
      if (!notebook) return res.status(404).json({ error: "Notebook not found" });

      const paper = notebook.papers.find((p) => p.id === req.params.paperId);
      if (!paper) return res.status(404).json({ error: "Paper not found" });

      const { maxCitations = 5, hopDepth = 1 } = req.body;

      // Extract baseline citations if they are not already populated
      let citationsToResolve = paper.citations || [];
      if (citationsToResolve.length === 0) {
        try {
          const chunks = getPaperChunksWithVectors(paper.id);
          const bibText = getBibliographyText(chunks);
          const extractedBib = await extractCitationsFromBibliography(paper.title, bibText);
          citationsToResolve = extractedBib.map((ref) => ({
            id: `cited_${Math.random().toString(36).substr(2, 9)}`,
            title: ref.title,
            authors: ref.authors,
            year: ref.year,
            hopDepth,
            status: "pending",
            citationKey: ref.citationKey,
          }));
        } catch (bibErr) {
          console.error("Fidelity baseline fallback extraction failed:", bibErr);
        }
      }

      const resolvedList: ResolvedCitation[] = [];
      let ingestedCount = 0;

      // Take the subset of citations to resolve
      const subset = citationsToResolve.slice(0, maxCitations);

      for (const cit of subset) {
        if (cit.status === "resolved") {
          resolvedList.push(cit);
          continue;
        }

        // Query Semantic Scholar with metadata fallbacks
        const resolved = await resolveCitationOnSemanticScholar(cit.title, cit.authors, cit.year);

        if (resolved) {
          const finalRef: ResolvedCitation = {
            id: cit.id,
            title: resolved.title || cit.title,
            authors: resolved.authors || cit.authors,
            year: resolved.year || cit.year,
            venue: resolved.venue,
            openAccessUrl: resolved.openAccessUrl,
            abstract: resolved.abstract,
            hopDepth,
            ingested: false,
            status: "resolved",
            citationKey: cit.citationKey,
          };

          // Fallback to Open Access ingestion if available
          if (resolved.openAccessUrl && ingestedCount < 10) {
            const success = await ingestOpenAccessPdf(resolved.openAccessUrl, cit.id, finalRef.title);
            if (success) {
              finalRef.ingested = true;
              // Add paper as a regular ingested paper as well so users can query/chat with it!
              notebook.papers.push({
                id: cit.id,
                title: finalRef.title,
                filename: `${finalRef.title.replace(/\s+/g, "_")}.pdf`,
                totalPages: 5,
                uploadedAt: new Date().toISOString(),
                url: finalRef.openAccessUrl,
                citationResolved: true,
              });
              ingestedCount++;
            }
          }

          resolvedList.push(finalRef);
        } else {
          // Keep the baseline citation on failure, but update its status to "failed"
          resolvedList.push({
            ...cit,
            status: "failed",
          });
        }
      }

      // Add back the ones that were not resolved this run
      const remainingCitations = citationsToResolve.slice(maxCitations);
      paper.citations = [...resolvedList, ...remainingCitations];
      paper.citationResolved = true;

      saveNotebook(notebook);
      res.json({ notebook, citations: paper.citations });
    } catch (err: any) {
      console.error("Citation resolve error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Get Paper Chunks Endpoint
  app.get("/api/notebooks/:id/papers/:paperId/chunks", (req, res) => {
    try {
      const notebook = getNotebook(req.params.id);
      if (!notebook) return res.status(404).json({ error: "Notebook not found" });

      const paper = notebook.papers.find((p) => p.id === req.params.paperId);
      if (!paper) return res.status(404).json({ error: "Paper not found" });

      const chunks = getPaperChunksWithVectors(paper.id);
      // Strip out large vector arrays to save bandwidth and keep response small and fast!
      const sanitizedChunks = chunks.map(c => ({
        id: c.id,
        paperId: c.paperId,
        page: c.page,
        contentType: c.contentType,
        text: c.text,
      }));

      res.json({ chunks: sanitizedChunks });
    } catch (err: any) {
      console.error("Failed to get paper chunks:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Serve raw PDF file for iframe
  app.get("/api/papers/:paperId/pdf", (req, res) => {
    try {
      const { paperId } = req.params;
      const pdfPath = path.join(DATA_DIR, "pdfs", `${paperId}.pdf`);
      if (fs.existsSync(pdfPath)) {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "inline");
        res.sendFile(pdfPath);
      } else {
        console.warn(`[PDF Service] File not found: ${pdfPath}`);
        res.status(404).json({ error: "PDF file not found" });
      }
    } catch (err: any) {
      console.error("[PDF Service] Error serving PDF:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 9. Citation Fidelity Checker
  app.post("/api/notebooks/:id/papers/:paperId/fidelity-check", async (req, res) => {
    try {
      const notebook = getNotebook(req.params.id);
      if (!notebook) return res.status(404).json({ error: "Notebook not found" });

      const paper = notebook.papers.find((p) => p.id === req.params.paperId);
      if (!paper) return res.status(404).json({ error: "Paper not found" });

      if (!paper.citations || paper.citations.length === 0) {
        return res.status(400).json({ error: "No baseline or resolved citations found to verify. Please upload a paper first." });
      }

      const originalChunks = getPaperChunksWithVectors(paper.id);
      const sampleText = originalChunks
        .slice(0, 10)
        .map((c) => c.text)
        .join("\n\n");

      const fidelityResults: CitationFidelityResult[] = [];

      for (const cit of paper.citations) {
        let citedText = cit.abstract || "";
        
        // Check retraction status via Crossref
        let isRetracted = false;
        try {
          isRetracted = await checkRetractionStatus(cit.title);
          cit.retracted = isRetracted; // update in-place in notebook citations
        } catch (err) {
          console.error(`Failed retraction check for citation "${cit.title}":`, err);
        }

        // Check if full text is ingested for this citation
        let isFullText = false;
        try {
          const citedChunks = getPaperChunksWithVectors(cit.id);
          if (citedChunks && citedChunks.length > 0) {
            citedText = citedChunks.slice(0, 15).map(c => c.text).join("\n\n");
            isFullText = true;
          }
        } catch (e) {
          // Fallback to abstract
        }

        if (!citedText || citedText.includes("No abstract available") || citedText.trim() === "") {
          fidelityResults.push({
            citationMarker: cit.citationKey || `[${cit.title.split(" ")[0]} et al., ${cit.year || "n.d."}]`,
            citedPaperId: cit.id,
            citedPaperTitle: cit.title,
            claimInPaper: `Claims regarding "${cit.title}"`,
            status: "Unverifiable",
            justification: "Cited paper has no abstract or full text ingested to verify claims against.",
            verifiedAt: new Date().toISOString(),
            retracted: isRetracted,
          });
          continue;
        }

        const check = await performFidelityChecks(
          paper.title,
          sampleText,
          cit.title,
          citedText
        );

        fidelityResults.push({
          citationMarker: cit.citationKey || `[${cit.title.split(" ")[0]} et al., ${cit.year || "n.d."}]`,
          citedPaperId: cit.id,
          citedPaperTitle: cit.title,
          claimInPaper: `Claims regarding "${cit.title}"`,
          status: (check.status || "Unverifiable") as any,
          justification: check.justification || "No justification provided.",
          verifiedAt: new Date().toISOString(),
          divergence_type: check.divergence_type,
          divergence_description: check.divergence_description,
          retracted: isRetracted,
        });
      }

      // Filter out old results for this paper's citations before adding new ones
      const citationIds = new Set(paper.citations.map(c => c.id));
      const otherFidelityResults = (notebook.fidelityResults || []).filter(
        (f) => !citationIds.has(f.citedPaperId)
      );

      notebook.fidelityResults = [
        ...otherFidelityResults,
        ...fidelityResults,
      ];

      saveNotebook(notebook);
      res.json({ notebook, fidelityResults });
    } catch (err: any) {
      console.error("Fidelity checker error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 10. Generate Grounded Reports
  app.post("/api/notebooks/:id/reports", async (req, res) => {
    try {
      const notebook = getNotebook(req.params.id);
      if (!notebook) return res.status(404).json({ error: "Notebook not found" });

      const { prompt, templateType, complexity = "plain", jargon = "as-is", paperIds } = req.body;
      if (!prompt || !templateType) {
        return res.status(400).json({ error: "Prompt and templateType are required." });
      }

      const targetPaperIds = paperIds && paperIds.length > 0
        ? paperIds
        : notebook.papers.map((p) => p.id);

      if (targetPaperIds.length === 0) {
        return res.status(400).json({ error: "Please upload at least one paper before generating reports." });
      }

      // Collect all chunks from selected papers
      const allChunks: PaperChunk[] = [];
      for (const pId of targetPaperIds) {
        const full = getPaperChunksWithVectors(pId);
        allChunks.push(...full.map(c => ({
          id: c.id,
          paperId: c.paperId,
          page: c.page,
          contentType: c.contentType,
          text: c.text,
        })));
      }

      // Sample or filter chunks so we stay within context window constraints
      const selectedChunks = allChunks.slice(0, 40); // select top chunks

      console.log(`Generating grounded report for: "${prompt}" using ${selectedChunks.length} chunks...`);
      const paperList = notebook.papers.filter((p) => targetPaperIds.includes(p.id));

      const availableSourcesForReport: { id: string; title: string; authors?: string; year?: number; isAbstractOnly?: boolean }[] = [];
      paperList.forEach((p) => {
        availableSourcesForReport.push({
          id: p.id,
          title: p.title,
          authors: "Original Source Paper",
          year: 2026,
          isAbstractOnly: false,
        });
        if (p.citations) {
          p.citations.forEach((cit) => {
            availableSourcesForReport.push({
              id: cit.id,
              title: cit.title,
              authors: cit.authors || "Unknown Authors",
              year: cit.year,
              isAbstractOnly: !cit.ingested,
            });
          });
        }
      });

      const reportData = await generateGroundedReport(
        prompt,
        templateType,
        selectedChunks,
        availableSourcesForReport,
        { complexity, jargon }
      );

      // Match references with fidelity scores if they exist
      const enrichedReferences = reportData.references.map((ref) => {
        const fidelityMatch = notebook.fidelityResults?.find(
          (f) => f.citedPaperTitle.toLowerCase() === ref.title.toLowerCase()
        );
        return {
          ...ref,
          fidelity: fidelityMatch?.status,
          fidelityJustification: fidelityMatch?.justification,
          divergence_type: fidelityMatch?.divergence_type,
          divergence_description: fidelityMatch?.divergence_description,
          retracted: fidelityMatch?.retracted,
        };
      });

      const newReport: Report = {
        id: `report_${Math.random().toString(36).substr(2, 9)}`,
        title: `${templateType.replace(/_/g, " ").toUpperCase()} - ${prompt.substring(0, 30)}...`,
        prompt,
        templateType,
        content: reportData.content,
        createdAt: new Date().toISOString(),
        complexity,
        jargon,
        references: enrichedReferences,
      };

      notebook.reports.push(newReport);

      saveNotebook(notebook);
      res.status(201).json({ report: newReport, notebook });
    } catch (err: any) {
      console.error("Report generation error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  async function startServer() {
    // Ensure preloaded papers are present
    await downloadPreloadedPapers().catch((err) => console.error("Error downloading preloaded paper:", err));

    // Vite Integration for dev mode, asset serving in production
    if (process.env.NODE_ENV !== "production") {
      try {
        const { createServer: createViteServer } = await import("vite");
        const vite = await createViteServer({
          server: { middlewareMode: true },
          appType: "spa",
        });
        app.use(vite.middlewares);
        console.log("Vite middleware mounted in development mode.");
      } catch (err) {
        console.error("Failed to start Vite middleware:", err);
      }
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        if (req.path.startsWith("/api/")) {
          return res.status(404).json({ error: "API route not found" });
        }
        const indexPath = path.join(distPath, "index.html");
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath);
        } else {
          res.status(404).send("Not found");
        }
      });
      console.log(`Serving static production build from ${distPath}`);
    }

    if (!process.env.VERCEL) {
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://localhost:${PORT}`);
      });
    }
  }

  startServer();

export default app;
