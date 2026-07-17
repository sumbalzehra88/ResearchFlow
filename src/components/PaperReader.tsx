import React, { useState, useEffect, useMemo } from "react";
import { FileText, Compass, CheckCircle, HelpCircle, AlertTriangle, ShieldCheck, BookOpen, Layers, Eye, Sparkles, Search, ChevronDown, ChevronUp, ExternalLink, RefreshCw, Play } from "lucide-react";
import { Notebook, Paper, ResolvedCitation } from "../types";
import katex from "katex";
import PaperDiagram from "./PaperDiagram";
import FormattedMarkdown from "./FormattedMarkdown";
import PDFCanvasViewer from "./PDFCanvasViewer";

// Preprocess typical plain text mathematical expressions into LaTeX notation for KaTeX to pick up
function preprocessPlainMath(text: string): string {
  if (!text) return "";
  let res = text;
  
  // Replace Attention formula
  res = res.replace(/Attention\(Q,\s*K,\s*V\s*\)\s*=\s*softmax\(\s*QKT\s*\n?\s*√?d_?k\s*\n?\s*\)V(?:\s*\(1\))?/gi, 
    "$$\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{Q K^T}{\\sqrt{d_k}}\\right) V$$"
  );
  res = res.replace(/Attention\(Q,\s*K,\s*V\s*\)\s*=\s*softmax\(\s*QKT\s*\\\/\s*√?d_?k\s*\)V/gi, 
    "$$\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{Q K^T}{\\sqrt{d_k}}\\right) V$$"
  );

  // Replace MultiHead formula
  res = res.replace(/MultiHead\(Q,\s*K,\s*V\s*\)\s*=\s*Concat\(head1,\s*\.\.\.,\s*headh\)W\s*O/gi,
    "$$\\text{MultiHead}(Q, K, V) = \\text{Concat}(\\text{head}_1, \\dots, \\text{head}_h) W^O$$"
  );

  // Replace headi formula
  res = res.replace(/headi\s*=\s*Attention\(QW\s*Q\s*\n?i\s*,\s*KW\s*K\s*\n?i\s*,\s*VW\s*V\s*\n?i\s*\)/gi,
    "$$\\text{head}_i = \\text{Attention}(Q W_i^Q, K W_i^K, V W_i^V)$$"
  );

  // Replace PE formulas
  res = res.replace(/P\s*E\(pos,\s*2i\)\s*=\s*sin\(pos\/100002i\/dmodel\s*\)/gi,
    "$$\\text{PE}_{(\\text{pos}, 2i)} = \\sin\\left(\\frac{\\text{pos}}{10000^{2i/d_{\\text{model}}}}\\right)$$"
  );
  res = res.replace(/P\s*E\(pos,\s*2i\+1\)\s*=\s*cos\(pos\/100002i\/dmodel\s*\)/gi,
    "$$\\text{PE}_{(\\text{pos}, 2i+1)} = \\cos\\left(\\frac{\\text{pos}}{10000^{2i/d_{\\text{model}}}}\\right)$$"
  );

  // Replace dimension parameters and parameter matrices
  res = res.replace(/W\s*Q\s*\n?i\s*∈\s*Rdmodel×dk\s*,\s*W\s*K\s*\n?i\s*∈\s*Rdmodel×dk\s*,\s*W\s*V\s*\n?i\s*∈\s*Rdmodel×dv/g,
    "$$W_i^Q \\in \\mathbb{R}^{d_{\\text{model}} \\times d_k}, \\quad W_i^K \\in \\mathbb{R}^{d_{\\text{model}} \\times d_k}, \\quad W_i^V \\in \\mathbb{R}^{d_{\\text{model}} \\times d_v}$$"
  );
  res = res.replace(/W\s*O\s*∈\s*Rhdv\s*×dmodel/g,
    "$$W^O \\in \\mathbb{R}^{h d_v \\times d_{\\text{model}}}$$"
  );

  // Replace inline variables like dmodel, dk, dv
  res = res.replace(/(?<!\w)dmodel(?!\w)/g, "$d_{\\text{model}}$");
  res = res.replace(/(?<!\w)dk(?!\w)/g, "$d_k$");
  res = res.replace(/(?<!\w)dv(?!\w)/g, "$d_v$");

  return res;
}

interface Props {
  notebook: Notebook;
  onUpdate: (updated: Notebook) => void;
}

export default function PaperReader({ notebook, onUpdate }: Props) {
  const [selectedPaperId, setSelectedPaperId] = useState<string>("");
  const [chunks, setChunks] = useState<any[]>([]);
  const [isLoadingChunks, setIsLoadingChunks] = useState(false);
  const [hoveredCitationId, setHoveredCitationId] = useState<string | null>(null);
  const [selectedCitationId, setSelectedCitationId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"pdf" | "text">("pdf");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isResolving, setIsResolving] = useState<boolean>(false);
  const [isCheckingFidelity, setIsCheckingFidelity] = useState<boolean>(false);

  const handleResolveCitations = async () => {
    if (!selectedPaperId) return;
    setIsResolving(true);
    try {
      const res = await fetch(`/api/notebooks/${notebook.id}/papers/${selectedPaperId}/resolve-citations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxCitations: 8 }),
      });
      if (res.ok) {
        const data = await res.json();
        onUpdate(data.notebook);
      }
    } catch (e) {
      console.error("Resolve error", e);
    } finally {
      setIsResolving(false);
    }
  };

  const handleRunFidelityCheck = async () => {
    if (!selectedPaperId) return;
    setIsCheckingFidelity(true);
    try {
      const res = await fetch(`/api/notebooks/${notebook.id}/papers/${selectedPaperId}/fidelity-check`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        onUpdate(data.notebook);
      }
    } catch (e) {
      console.error("Fidelity check error", e);
    } finally {
      setIsCheckingFidelity(false);
    }
  };

  // Set default paper if not set
  useEffect(() => {
    if (notebook.papers.length > 0 && !selectedPaperId) {
      setSelectedPaperId(notebook.papers[0].id);
    }
  }, [notebook.papers, selectedPaperId]);

  const activePaper = useMemo(() => {
    return notebook.papers.find((p) => p.id === selectedPaperId) || null;
  }, [notebook.papers, selectedPaperId]);

  // Fetch chunks for the selected paper
  useEffect(() => {
    if (!selectedPaperId) {
      setChunks([]);
      return;
    }

    async function fetchChunks() {
      setIsLoadingChunks(true);
      try {
        const res = await fetch(`/api/notebooks/${notebook.id}/papers/${selectedPaperId}/chunks`);
        if (res.ok) {
          const data = await res.json();
          setChunks(data.chunks || []);
        }
      } catch (err) {
        console.error("Error fetching paper chunks:", err);
      } finally {
        setIsLoadingChunks(false);
      }
    }

    fetchChunks();
  }, [selectedPaperId, notebook.id]);

  // Map citation markers to ResolvedCitation
  const citations = useMemo(() => {
    if (!activePaper) return [];
    return activePaper.citations || [];
  }, [activePaper]);

  const filteredCitations = useMemo(() => {
    if (!searchQuery.trim()) return citations;
    const q = searchQuery.toLowerCase();
    return citations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.authors.toLowerCase().includes(q) ||
        (c.citationKey && c.citationKey.toLowerCase().includes(q))
    );
  }, [citations, searchQuery]);

  // Group chunks by page for a beautiful paginated reader layout
  const pages = useMemo(() => {
    const grouped: Record<number, any[]> = {};
    chunks.forEach((chunk) => {
      const p = chunk.page || 1;
      if (!grouped[p]) grouped[p] = [];
      grouped[p].push(chunk);
    });
    return Object.entries(grouped)
      .map(([page, items]) => ({
        page: parseInt(page, 10),
        chunks: items,
      }))
      .sort((a, b) => a.page - b.page);
  }, [chunks]);

  // Render text containing block or inline math equations using KaTeX
  const renderTextWithMath = (text: string) => {
    if (!text) return null;

    // Split by display math $$...$$ and \[...\] (with optional double-escaping) first, then inline math $...$ and \(...\) (with optional double-escaping)
    const mathRegex = /(\$\$[\s\S]+?\$\$|\\{1,2}\[[\s\S]+?\\{1,2}\]|(?<![\w$])\$[^$\n]+?\$(?![\w$])|\\{1,2}\([\s\S]+?\\{1,2}\))/g;
    const parts = text.split(mathRegex);

    if (parts.length === 1) return text;

    return parts.map((part, idx) => {
      if (!part) return null;

      // Check if it's a display math block $$...$$ or \[...\] / \\[...\\\]
      const isDisplayMath = (part.startsWith("$$") && part.endsWith("$$")) || 
                          (part.match(/^\\+\[/) && part.match(/\\+\]$/));

      if (isDisplayMath) {
        let tex = part;
        if (part.startsWith("$$")) {
          tex = part.slice(2, -2);
        } else {
          const startMatch = part.match(/^\\+\[/);
          const endMatch = part.match(/\\+\]$/);
          if (startMatch && endMatch) {
            tex = part.slice(startMatch[0].length, -endMatch[0].length);
          }
        }
        try {
          const html = katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false });
          return (
            <span
              key={idx}
              className="block my-3 overflow-x-auto text-center py-2 bg-slate-100/50 border border-slate-200/40 rounded-xl"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        } catch (e) {
          return <pre key={idx} className="text-red-500 font-mono text-[10px] my-1">{tex}</pre>;
        }
      }

      // Check if it's inline math $...$ or \(...\) / \\(...\\)
      const isInlineMath = (part.startsWith("$") && part.endsWith("$")) || 
                         (part.match(/^\\+\(/) && part.match(/\\+\)$/));

      if (isInlineMath) {
        let tex = part;
        if (part.startsWith("$")) {
          tex = part.slice(1, -1);
        } else {
          const startMatch = part.match(/^\\+\(/);
          const endMatch = part.match(/\\+\)$/);
          if (startMatch && endMatch) {
            tex = part.slice(startMatch[0].length, -endMatch[0].length);
          }
        }
        try {
          const html = katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false });
          return (
            <span
              key={idx}
              className="inline-block align-middle mx-1 font-semibold text-gray-900"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        } catch (e) {
          return <code key={idx} className="text-red-500 font-mono text-[10px]">{tex}</code>;
        }
      }

      return <span key={idx}>{part}</span>;
    });
  };

  // High-fidelity text decorator to inject custom clickable & hoverable citation spans
  const renderTextWithCitations = (text: string) => {
    const preparedText = preprocessPlainMath(text);
    if (citations.length === 0) return renderTextWithMath(preparedText);

    // Filter citations that have keys
    const validCitations = citations.filter((c) => c.citationKey);
    if (validCitations.length === 0) return renderTextWithMath(preparedText);

    // Sort by key length descending so we match longer citation markers first (preventing partial matches)
    const sortedCitations = [...validCitations].sort(
      (a, b) => (b.citationKey?.length || 0) - (a.citationKey?.length || 0)
    );

    // Escape regex characters in keys
    const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = sortedCitations.map((c) => `(${escapeRegExp(c.citationKey!)})`).join("|");
    const regex = new RegExp(pattern, "g");

    const parts = preparedText.split(regex);
    if (parts.length === 1) return renderTextWithMath(preparedText);

    return parts.map((part, idx) => {
      if (!part) return null;

      const citation = sortedCitations.find((c) => c.citationKey === part);
      if (citation) {
        const isHovered = hoveredCitationId === citation.id;
        const isSelected = selectedCitationId === citation.id;

        // Check if there is an associated fidelity check result for this citation
        const fidelity = notebook.fidelityResults?.find((f) => f.citedPaperId === citation.id);

        return (
          <span
            key={idx}
            className="relative group inline-block align-baseline mx-0.5"
            onMouseEnter={() => setHoveredCitationId(citation.id)}
            onMouseLeave={() => setHoveredCitationId(null)}
            onClick={() => {
              setSelectedCitationId(isSelected ? null : citation.id);
              // Scroll to citation card in bibliography panel
              const card = document.getElementById(`bib-card-${citation.id}`);
              if (card) {
                card.scrollIntoView({ behavior: "smooth", block: "nearest" });
              }
            }}
          >
            <span
              className={`font-sans font-bold text-[10.5px] px-1 rounded cursor-pointer transition-all border ${
                isSelected
                  ? "bg-[#6C5CE7] text-white border-[#6C5CE7]"
                  : isHovered
                  ? "bg-[#6C5CE7]/25 text-[#6C5CE7] border-[#6C5CE7]/30 scale-[1.05]"
                  : "bg-[#6C5CE7]/10 text-[#6C5CE7] border-[#6C5CE7]/10 hover:bg-[#6C5CE7]/20"
              }`}
            >
              {part}
            </span>

            {/* Micro hover card */}
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-[#1A1A1A] text-white text-[10.5px] p-3 rounded-2xl shadow-xl w-64 z-50 font-sans leading-normal normal-case border border-white/10">
              <span className="font-bold text-[#DCD7FC] block mb-0.5 uppercase tracking-wider text-[8px]">
                In-Text Reference
              </span>
              <span className="font-serif font-bold text-white block leading-tight">
                {citation.title}
              </span>
              <span className="text-gray-300 block text-[9.5px] mt-1.5 italic">
                {citation.authors} ({citation.year || "n.d."})
              </span>
              
              {fidelity && (
                <span className="mt-2 pt-1.5 border-t border-dashed border-white/15 block">
                  <span className="font-semibold text-amber-300 block uppercase tracking-widest text-[7.5px] mb-0.5">
                    Fidelity Check: {fidelity.status}
                  </span>
                  <span className="text-gray-300 text-[9px] italic block leading-snug">
                    "{fidelity.justification}"
                  </span>
                </span>
              )}

              <span className="text-gray-400 text-[8px] font-mono block mt-2">
                Click to highlight reference details
              </span>
            </span>
          </span>
        );
      }

      return <span key={idx}>{renderTextWithMath(part)}</span>;
    });
  };

  const getFidelityBadge = (fidelity: any) => {
    if (!fidelity) return null;
    const status = fidelity.status || "Unverifiable";
    const retracted = fidelity.retracted;
    const divergence_type = fidelity.divergence_type;

    let badgeText = status;
    if ((status === "Partially supported" || status === "Unsupported") && divergence_type) {
      const formattedType = divergence_type.replace(/_/g, " ");
      badgeText = `${status} — ${formattedType}`;
    }

    let badgeClass = "fidelity unverifiable text-[9px] px-1.5 py-0.5 font-bold uppercase tracking-wide";
    if (status === "Supported") badgeClass = "fidelity supported text-[9px] px-1.5 py-0.5 font-bold uppercase tracking-wide";
    else if (status === "Unsupported") badgeClass = "fidelity unsupported text-[9px] px-1.5 py-0.5 font-bold uppercase tracking-wide";

    return (
      <div className="flex items-center gap-1.5 flex-wrap shrink-0">
        {retracted && (
          <span className="bg-red-500 text-white font-extrabold text-[8px] px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse">
            ⚠️ Retracted
          </span>
        )}
        <span className={badgeClass}>{badgeText}</span>
      </div>
    );
  };

  return (
    <div id="sec-reader" className="bg-white/55 backdrop-blur-md border border-white/90 rounded-2xl p-4 shadow-sm flex flex-col h-[520px]">
      {/* Header controls select dropdown */}
      <div className="flex items-center justify-between pb-3 border-b border-black/5 flex-wrap gap-2.5">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-[#6C5CE7]" />
          <h2 className="text-[12.5px] uppercase tracking-[0.09em] font-bold text-[#5B5570]">Paper Reader</h2>
        </div>

        {notebook.papers.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[9.5px] font-bold text-[#8B85A0] uppercase tracking-wider font-mono">Select Source:</span>
            <select
              value={selectedPaperId}
              onChange={(e) => setSelectedPaperId(e.target.value)}
              className="text-xs font-semibold bg-white border border-black/10 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#6C5CE7] text-gray-800"
            >
              {notebook.papers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {notebook.papers.length === 0 ? (
        <div className="my-auto text-center py-16">
          <FileText className="w-10 h-10 text-[#8B85A0]/20 mx-auto mb-2 animate-bounce" />
          <p className="text-xs font-bold text-[#5B5570] uppercase tracking-wider">No paper selected</p>
          <p className="text-[11px] text-[#8B85A0] max-w-[280px] mx-auto mt-1 leading-relaxed">
            Please upload a research paper on the left to begin interactive bibliography tracing and layout parsing.
          </p>
        </div>
      ) : activePaper && isLoadingChunks ? (
        <div className="my-auto text-center py-16">
          <Compass className="w-8 h-8 text-[#6C5CE7]/40 mx-auto mb-2 animate-spin-slow" />
          <p className="text-xs font-bold text-[#5B5570] uppercase tracking-wider">Parsing layout structure...</p>
          <p className="text-[11px] text-[#8B85A0] mt-1">Reading pages and building visual-grounded tokens.</p>
        </div>
      ) : (
        <div className="flex-1 flex gap-4 min-h-0 py-3">
          {/* High-Fidelity Original PDF Panel */}
          <div className="flex-1 flex flex-col min-h-0 relative">
            <PDFCanvasViewer paperId={selectedPaperId} />
          </div>

          {/* Right Bibliography Panel */}
          <div className="w-80 md:w-96 bg-[#F8F7FB] border border-black/[0.06] rounded-2xl p-4 flex flex-col gap-3 min-h-0 shrink-0 shadow-sm">
            <div className="flex items-center justify-between border-b border-black/5 pb-2.5 shrink-0">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#6C5CE7]" />
                <span className="text-[10px] font-extrabold text-[#5B5570] uppercase tracking-wider font-sans">
                  Extracted Bibliography
                </span>
              </div>
              {citations.length > 0 && (
                <span className="text-[10px] font-mono font-bold bg-[#6C5CE7]/10 text-[#6C5CE7] px-2 py-0.5 rounded-full">
                  {citations.length} References
                </span>
              )}
            </div>

            {citations.length === 0 ? (
              <div className="my-auto text-center py-8 px-4 flex flex-col items-center justify-center gap-3">
                <div className="p-3 bg-[#6C5CE7]/5 rounded-2xl border border-[#6C5CE7]/10">
                  <Compass className={`w-8 h-8 text-[#6C5CE7] ${isResolving ? "animate-spin" : ""}`} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#241F33] uppercase tracking-wider">Unresolved Bibliography</h4>
                  <p className="text-[10.5px] text-[#8B85A0] mt-1 leading-relaxed max-w-[220px] mx-auto">
                    The reference citations have not been mapped for this paper. Pull metadata, journals, and abstracts from Semantic Scholar.
                  </p>
                </div>
                <button
                  onClick={handleResolveCitations}
                  disabled={isResolving}
                  className="w-full mt-2 text-[11px] font-bold text-white bg-[#6C5CE7] hover:bg-[#5b4ec7] disabled:opacity-50 px-4 py-2 rounded-xl cursor-pointer flex items-center justify-center gap-1.5 transition-all shadow-sm uppercase tracking-wider"
                >
                  {isResolving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Extracting References...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Extract & Resolve Bibliography</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0 gap-3">
                {/* Search Bar */}
                <div className="relative shrink-0">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <Search className="h-3.5 w-3.5 text-gray-400" />
                  </span>
                  <input
                    type="text"
                    placeholder="Search references by title, author..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full text-xs bg-white border border-black/10 rounded-xl pl-9 pr-4 py-2 focus:outline-none focus:ring-1 focus:ring-[#6C5CE7] placeholder-gray-400"
                  />
                </div>

                {/* Fidelity Action Trigger */}
                <div className="bg-white border border-black/[0.04] p-2.5 rounded-xl flex items-center justify-between gap-2 shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-[#8B85A0] uppercase tracking-wider font-mono">Claims Validation</span>
                    <span className="text-[10px] text-gray-500 font-medium">Verify paper scientific integrity</span>
                  </div>
                  <button
                    onClick={handleRunFidelityCheck}
                    disabled={isCheckingFidelity}
                    className="text-[9.5px] font-extrabold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 px-2.5 py-1.5 rounded-lg cursor-pointer flex items-center gap-1 transition-all uppercase tracking-wider shadow-sm"
                  >
                    {isCheckingFidelity ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <Play className="w-3 h-3" />
                    )}
                    <span>{isCheckingFidelity ? "Verifying..." : "Run Claims Check"}</span>
                  </button>
                </div>

                {/* References Scroll list */}
                <div className="flex-1 overflow-y-auto flex flex-col gap-2.5 pr-1">
                  {filteredCitations.length === 0 ? (
                    <div className="text-center py-10">
                      <p className="text-xs text-[#8B85A0] italic">No matching references found.</p>
                    </div>
                  ) : (
                    filteredCitations.map((cit) => {
                      const isHovered = hoveredCitationId === cit.id;
                      const isSelected = selectedCitationId === cit.id;
                      const fidelity = notebook.fidelityResults?.find((f) => f.citedPaperId === cit.id);

                      return (
                        <div
                          key={cit.id}
                          id={`bib-card-${cit.id}`}
                          onMouseEnter={() => setHoveredCitationId(cit.id)}
                          onMouseLeave={() => setHoveredCitationId(null)}
                          onClick={() => setSelectedCitationId(isSelected ? null : cit.id)}
                          className={`p-3 rounded-xl border transition-all duration-200 cursor-pointer shadow-sm flex flex-col gap-1.5 ${
                            isSelected
                              ? "bg-white border-[#6C5CE7] ring-1 ring-[#6C5CE7]/10"
                              : isHovered
                              ? "bg-white border-black/15 scale-[1.01]"
                              : "bg-white border-black/5 hover:bg-white/95"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className="text-[10.5px] font-sans font-bold text-[#6C5CE7] shrink-0 bg-[#6C5CE7]/5 px-2 py-0.5 rounded leading-none border border-[#6C5CE7]/10">
                              {cit.citationKey || "Ref"}
                            </span>

                            <div className="flex items-center gap-1">
                              {(cit.retracted || fidelity?.retracted) && (
                                <span className="text-[8px] bg-red-100 text-red-700 border border-red-200 font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded font-mono shrink-0 animate-pulse">
                                  ⚠️ Retracted
                                </span>
                              )}
                              {cit.ingested ? (
                                <span className="text-[8px] bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold uppercase tracking-wider px-1.5 py-0.5 rounded font-mono shrink-0">
                                  Full Text
                                </span>
                              ) : cit.status === "resolved" ? (
                                <span className="text-[8px] bg-amber-50 text-amber-700 border border-amber-100 font-bold uppercase tracking-wider px-1.5 py-0.5 rounded font-mono shrink-0">
                                  Abstract
                                </span>
                              ) : cit.status === "pending" ? (
                                <span className="text-[8px] bg-slate-50 text-slate-500 border border-slate-100 font-bold uppercase tracking-wider px-1.5 py-0.5 rounded font-mono shrink-0">
                                  Baseline
                                </span>
                              ) : (
                                <span className="text-[8px] bg-red-50 text-red-600 border border-red-100 font-bold uppercase tracking-wider px-1.5 py-0.5 rounded font-mono shrink-0">
                                  Unresolved
                                </span>
                              )}
                              <span>
                                {isSelected ? (
                                  <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                                )}
                              </span>
                            </div>
                          </div>

                          <h4 className={`text-[11.5px] font-serif font-bold text-[#241F33] leading-snug ${isSelected ? "" : "line-clamp-2"}`}>
                            {cit.title}
                          </h4>
                          <p className="text-[9.5px] text-[#8B85A0] font-sans leading-relaxed">
                            {cit.authors} ({cit.year || "n.d."})
                          </p>

                          {/* Expanded detail box */}
                          {isSelected && (
                            <div className="mt-2 pt-2 border-t border-black/5 flex flex-col gap-2.5 animate-fade-in">
                              {cit.venue && (
                                <div className="text-[9.5px] text-gray-500 font-medium font-mono uppercase tracking-wider">
                                  Published in: <span className="text-gray-800 font-bold">{cit.venue}</span>
                                </div>
                              )}

                              {cit.abstract ? (
                                <div className="bg-slate-50 border border-black/[0.03] p-2 rounded-xl">
                                  <span className="text-[8.5px] font-bold text-[#8B85A0] uppercase tracking-wider font-mono block mb-1">Abstract Summary</span>
                                  <p className="text-[10px] text-gray-600 font-serif leading-relaxed text-justify">
                                    {cit.abstract}
                                  </p>
                                </div>
                              ) : (
                                cit.status === "resolved" && (
                                  <p className="text-[10px] text-gray-400 italic">No abstract preview available.</p>
                                )
                              )}

                              {cit.openAccessUrl && (
                                <a
                                  href={cit.openAccessUrl}
                                  target="_blank"
                                  referrerPolicy="no-referrer"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-[#6C5CE7] text-[10px] font-bold rounded-xl transition cursor-pointer shadow-sm"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  Open External Source Paper
                                </a>
                              )}
                            </div>
                          )}

                          {fidelity && (
                            <div className="mt-1.5 pt-1.5 border-t border-dashed border-black/5 flex flex-col gap-1.5 bg-[#F1EEF7]/30 p-2 rounded-lg">
                              <div className="flex items-center justify-between gap-1 flex-wrap">
                                <span className="text-[7.5px] font-bold text-black/40 font-mono uppercase tracking-widest">Fidelity Check</span>
                                {getFidelityBadge(fidelity)}
                              </div>
                              <p className="text-[10px] font-serif text-[#5B5570] italic leading-normal">
                                "{fidelity.justification}"
                              </p>
                              {fidelity.divergence_description && (
                                <p className="text-[9.5px] font-sans text-amber-800 font-semibold bg-amber-50/50 p-1.5 rounded border border-amber-100/50">
                                  ⚠️ Divergence: {fidelity.divergence_description}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
