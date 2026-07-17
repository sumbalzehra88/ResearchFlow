import React, { useState, useEffect } from "react";
import {
  Activity,
  ArrowRight,
  BookOpen,
  ChevronRight,
  CheckCircle2,
  Compass,
  Download,
  Eye,
  FileText,
  Home,
  LogOut,
  Layers,
  Network,
  Plus,
  ShieldCheck,
  Sparkles,
  X,
  Zap
} from "lucide-react";
import { Notebook } from "./types";
import { exportNotebookToDocx } from "./lib/docxGenerator";
import NotebookSelector from "./components/NotebookSelector";
import PaperList from "./components/PaperList";
import ChatPanel from "./components/ChatPanel";
import ReportPanel from "./components/ReportPanel";
import TokenIndicator from "./components/TokenIndicator";
import CitationGraph from "./components/CitationGraph";
import PaperReader from "./components/PaperReader";

export default function App() {
  const [activeNotebook, setActiveNotebook] = useState<Notebook | null>(null);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [isLoadingNotebooks, setIsLoadingNotebooks] = useState(true);
  const [newNotebookName, setNewNotebookName] = useState("");
  const [activeLandingTab, setActiveLandingTab] = useState<"new" | "open">("new");
  const [workspaceTab, setWorkspaceTab] = useState<"network" | "chat" | "report" | "reader">("network");

  // Modal Visibility States
  const [showSolutions, setShowSolutions] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const [showBlog, setShowBlog] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);

  // Load Notebooks
  const loadNotebooks = async () => {
    setIsLoadingNotebooks(true);
    try {
      const res = await fetch("/api/notebooks");
      if (res.ok) {
        const data = await res.json();
        setNotebooks(data);
      }
    } catch (e) {
      console.error("Failed to load notebooks", e);
    } finally {
      setIsLoadingNotebooks(false);
    }
  };

  useEffect(() => {
    loadNotebooks();
  }, []);

  const handleUpdate = (updated: Notebook) => {
    setActiveNotebook(updated);
    // Sync back with local notebooks list
    setNotebooks((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
  };

  const handleCreateNotebook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNotebookName.trim()) return;

    try {
      const res = await fetch("/api/notebooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newNotebookName }),
      });

      if (res.ok) {
        const created = await res.json();
        setNotebooks((prev) => [...prev, created]);
        setActiveNotebook(created);
        setNewNotebookName("");
      } else {
        const errorText = await res.text();
        console.error("Failed to create notebook:", errorText);
        alert(`Failed to create notebook: ${errorText || res.statusText}`);
      }
    } catch (e) {
      console.error("Failed to create notebook", e);
      alert(`Error creating notebook: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // Background Ambient Glows and Dunes Wavy Path
  const AmbientBackground = () => (
    <div className="scene">
      <div className="glow g1"></div>
      <div className="glow g2"></div>
      <div className="glow g3"></div>
      <div className="bead" style={{ width: "14px", height: "14px", top: "22%", left: "14%", animationDelay: "1s" }}></div>
      <div className="bead" style={{ width: "9px", height: "9px", top: "38%", left: "70%", animationDelay: "3s" }}></div>
      <div className="bead" style={{ width: "11px", height: "11px", top: "64%", left: "46%", animationDelay: "5s" }}></div>
      <div className="bead" style={{ width: "7px", height: "7px", top: "15%", left: "52%", animationDelay: "7s" }}></div>
      
      <svg className="dunes" viewBox="0 0 1440 400" preserveAspectRatio="none">
        <path d="M0,180 C 240,260 480,120 720,170 C 960,220 1200,140 1440,190 L1440,400 L0,400 Z" fill="rgba(169,203,236,.35)"/>
        <path d="M0,230 C 260,180 500,270 760,220 C 1000,180 1220,250 1440,220 L1440,400 L0,400 Z" fill="rgba(242,185,196,.32)"/>
        <path d="M0,280 C 300,320 560,250 800,290 C 1040,330 1260,270 1440,300 L1440,400 L0,400 Z" fill="rgba(201,182,234,.4)"/>
      </svg>
    </div>
  );

  return (
    <div className="relative min-h-screen flex flex-col font-sans text-[#241F33] antialiased selection:bg-purple-100 selection:text-[#6C5CE7] overflow-x-hidden">
      
      <AmbientBackground />

      <div className="relative z-10 flex-1 flex flex-col">
        {!activeNotebook ? (
          // ==========================================
          // GORGEOUS LANDING VIEW
          // ==========================================
          <div className="relative flex-1 flex flex-col p-4 md:p-6 max-w-7xl w-full mx-auto justify-between">
            <header className="header glass">
              <div className="logo">
                <span className="mark"></span>
                <span className="font-sans font-bold text-gray-900 tracking-tight ml-2">ResearchFlow</span>
              </div>
              <div className="nav-utils">
                <button onClick={() => setShowWalkthrough(true)} className="util-btn">Walkthrough</button>
                <button onClick={() => setShowSolutions(true)} className="util-btn">Solutions</button>
                <button onClick={() => setShowBlog(true)} className="util-btn">Blog</button>
              </div>
            </header>

            <div className="gateway-wrap">
              <div className="eyebrow">Deep-research workspace</div>
              <h1 className="hero-title">
                Read every paper<br />
                <em>and check its work.</em>
              </h1>
              <p className="hero-sub">
                ResearchFlow ingests full papers, resolves every citation against Semantic Scholar, and flags exactly where a claim outruns its source.
              </p>

              <div className="gateway-card glass">
                <div className="gateway-tabs">
                  <button
                    className={`gtab ${activeLandingTab === "new" ? "active" : ""}`}
                    onClick={() => setActiveLandingTab("new")}
                  >
                    New notebook
                  </button>
                  <button
                    className={`gtab ${activeLandingTab === "open" ? "active" : ""}`}
                    onClick={() => setActiveLandingTab("open")}
                  >
                    Open existing
                  </button>
                </div>

                <div className="gateway-body">
                  {activeLandingTab === "new" && (
                    <form onSubmit={handleCreateNotebook} className="flex flex-col gap-4">
                      <div className="drop-zone">
                        <div className="dz-icon">＋</div>
                        <input
                          type="text"
                          value={newNotebookName}
                          onChange={(e) => setNewNotebookName(e.target.value)}
                          placeholder="Enter project name (e.g. Sparse Attention Surveys)..."
                          className="w-full text-center bg-transparent border-b border-black/10 py-2 focus:border-[#6C5CE7] focus:outline-none font-sans text-sm font-semibold text-gray-900 placeholder:text-gray-400"
                          autoFocus
                        />
                      </div>
                      <button type="submit" className="primary-cta justify-center w-full">
                        Launch notebook →
                      </button>
                    </form>
                  )}

                  {activeLandingTab === "open" && (
                    <div className="recent-list">
                      {isLoadingNotebooks ? (
                        <div className="text-center py-6 text-xs text-black/30 font-mono">Loading notebooks...</div>
                      ) : notebooks.length === 0 ? (
                        <div className="text-center py-6 text-xs text-gray-400">
                          No research notebooks found. Go to the "New notebook" tab to start.
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
                          {notebooks.map((nb, idx) => (
                            <div
                              key={nb.id}
                              className="recent-item"
                              onClick={() => setActiveNotebook(nb)}
                            >
                              <div className="min-w-0 flex-1 pr-3">
                                <div className="recent-name text-gray-900 truncate">{nb.name}</div>
                                <div className="recent-meta text-[#8B85A0]">
                                  {nb.papers?.length || 0} papers · created {new Date(nb.createdAt).toLocaleDateString()}
                                </div>
                              </div>
                              <span
                                className="recent-chip"
                                style={
                                  idx !== 0
                                    ? { background: "var(--bg-canvas-2)", color: "var(--ink-soft)" }
                                    : undefined
                                }
                              >
                                {idx === 0 ? "Active" : "Saved"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        ) : (
          // ==========================================
          // ACTIVE WORKSPACE VIEW
          // ==========================================
          <div className="relative flex-1 flex flex-col p-4 md:p-6 max-w-7xl w-full mx-auto pb-24">
            <header className="flex items-center justify-between p-4 rounded-xl glass border border-white/40 shadow-sm mb-6">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setActiveNotebook(null)}
                  className="p-2 bg-black/5 hover:bg-black/10 text-gray-600 rounded-lg transition-all cursor-pointer"
                  title="Return to Dashboard Hub"
                >
                  <Home className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-gradient-to-tr from-[#6C5CE7] to-[#4A90E2] text-white rounded-lg">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h1 className="text-xs font-bold text-gray-900 tracking-tight flex items-center gap-1.5">
                      <span>ResearchFlow Workspace</span>
                      <span className="text-[10px] text-gray-400 font-normal">/</span>
                      <span className="text-xs font-semibold text-[#6C5CE7] bg-[#6C5CE7]/5 px-2 py-0.5 rounded border border-[#6C5CE7]/10">
                        {activeNotebook.name}
                      </span>
                    </h1>
                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">
                      Semantic Citation Fact-Checking & Visual Figure Extraction Engine
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="hidden sm:inline-flex text-[9px] bg-white border border-black/5 text-gray-500 px-2.5 py-1.5 rounded-md font-mono font-medium">
                  Workspace Sync: Active
                </span>
                <button
                  onClick={() => exportNotebookToDocx(activeNotebook)}
                  className="flex items-center gap-1.5 text-[10px] text-[#6C5CE7] hover:text-white bg-[#6C5CE7]/10 hover:bg-[#6C5CE7] border border-[#6C5CE7]/20 px-3 py-1.5 rounded-lg font-bold uppercase tracking-wider transition-all cursor-pointer"
                  title="Export papers list, bibliography and fidelity results"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Word (.docx)</span>
                </button>
                <button
                  onClick={() => setActiveNotebook(null)}
                  className="flex items-center gap-1.5 text-[10px] text-black/70 hover:text-black bg-black/5 hover:bg-black/10 border border-black/10 px-3 py-1.5 rounded-lg font-bold uppercase tracking-wider transition-all cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5 text-black/50" />
                  <span>Exit Notebook</span>
                </button>
              </div>
            </header>

            <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* LEFT SIDEBAR COLUMN */}
              <section className="lg:col-span-4 flex flex-col gap-6">
                <NotebookSelector activeNotebook={activeNotebook} onSelect={setActiveNotebook} />
                <TokenIndicator />
                <PaperList notebook={activeNotebook} onUpdate={handleUpdate} />
              </section>

              {/* RIGHT MAIN WORKSPACE COLUMN */}
              <section className="lg:col-span-8 flex flex-col gap-6">
                <div className="section-nav glass bg-white/40 border border-white/60 p-1 rounded-2xl flex gap-1.5 w-fit">
                  <button
                    className={`snav-btn px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                      workspaceTab === "network"
                        ? "bg-[#241F33] text-white shadow-sm"
                        : "text-gray-500 hover:text-gray-800 hover:bg-black/5"
                    }`}
                    onClick={() => setWorkspaceTab("network")}
                  >
                    Citation Network
                  </button>
                  <button
                    className={`snav-btn px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                      workspaceTab === "chat"
                        ? "bg-[#241F33] text-white shadow-sm"
                        : "text-gray-500 hover:text-gray-800 hover:bg-black/5"
                    }`}
                    onClick={() => setWorkspaceTab("chat")}
                  >
                    Deep-Research Chat
                  </button>
                  <button
                    className={`snav-btn px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                      workspaceTab === "report"
                        ? "bg-[#241F33] text-white shadow-sm"
                        : "text-gray-500 hover:text-gray-800 hover:bg-black/5"
                    }`}
                    onClick={() => setWorkspaceTab("report")}
                  >
                    Report Compiler
                  </button>
                  <button
                    className={`snav-btn px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                      workspaceTab === "reader"
                        ? "bg-[#241F33] text-white shadow-sm"
                        : "text-gray-500 hover:text-gray-800 hover:bg-black/5"
                    }`}
                    onClick={() => setWorkspaceTab("reader")}
                  >
                    Paper Reader
                  </button>
                </div>

                {workspaceTab === "network" && (
                  <CitationGraph notebook={activeNotebook} onUpdate={handleUpdate} />
                )}
                {workspaceTab === "chat" && (
                  <ChatPanel notebook={activeNotebook} onUpdate={handleUpdate} />
                )}
                {workspaceTab === "report" && (
                  <ReportPanel notebook={activeNotebook} onUpdate={handleUpdate} />
                )}
                {workspaceTab === "reader" && (
                  <PaperReader notebook={activeNotebook} onUpdate={handleUpdate} />
                )}
              </section>
            </main>
          </div>
        )}
      </div>

      {/* ==========================================
          MODALS & DIALOG FLIGHT PANELS
         ========================================== */}

      {/* 1. SOLUTIONS MODAL */}
      {showSolutions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/35 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-2xl glass rounded-3xl p-6 md:p-8 border border-white/50 shadow-2xl">
            <button
              onClick={() => setShowSolutions(false)}
              className="absolute top-5 right-5 p-1.5 rounded-full hover:bg-black/5 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-6">
              <span className="text-[9px] font-bold text-[#6C5CE7] uppercase tracking-widest bg-[#6C5CE7]/10 px-2.5 py-1 rounded-md">
                Solutions Suite
              </span>
              <h2 className="text-xl font-bold text-gray-900 tracking-tight font-sans mt-3">
                ResearchFlow Core AI Engines
              </h2>
              <p className="text-xs text-gray-500 leading-relaxed mt-1 font-medium">
                Four advanced modules built to streamline your paper synthesis, chart analysis, and citation verification workflows.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-2">
              <div className="p-4 bg-white/60 border border-white rounded-2xl">
                <Compass className="w-5 h-5 text-[#6C5CE7] mb-2" />
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-1">
                  Multi-Paper Semantic Search
                </h3>
                <p className="text-[11px] text-gray-500 leading-relaxed font-medium">
                  Query multiple uploaded PDFs concurrently. Retrieve answers with precise text layout coordinates, preventing source attribution errors.
                </p>
              </div>

              <div className="p-4 bg-white/60 border border-white rounded-2xl">
                <Network className="w-5 h-5 text-[#4A90E2] mb-2" />
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-1">
                  Semantic Scholar Graph Core
                </h3>
                <p className="text-[11px] text-gray-500 leading-relaxed font-medium">
                  Automatically trace cite paths and retrieve citation metadata using real-time open-access Semantic Scholar network graphs.
                </p>
              </div>

              <div className="p-4 bg-white/60 border border-white rounded-2xl">
                <Eye className="w-5 h-5 text-[#6C5CE7] mb-2" />
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-1">
                  Gemini Visual Analysis
                </h3>
                <p className="text-[11px] text-gray-500 leading-relaxed font-medium">
                  Analyze charts, figures, tables, and mathematical formulas directly from PDF images with high-fidelity document parsing.
                </p>
              </div>

              <div className="p-4 bg-white/60 border border-white rounded-2xl">
                <ShieldCheck className="w-5 h-5 text-[#2F7D74] mb-2" />
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-1">
                  Factual Consistency Checker
                </h3>
                <p className="text-[11px] text-gray-500 leading-relaxed font-medium">
                  Audit compiled reviews with automated fidelity warnings (Supported, Partially Supported, Unsupported) to prevent factual misattributions.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. BLOG MODAL */}
      {showBlog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/35 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-2xl glass rounded-3xl p-6 md:p-8 border border-white/50 shadow-2xl">
            <button
              onClick={() => setShowBlog(false)}
              className="absolute top-5 right-5 p-1.5 rounded-full hover:bg-black/5 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-6">
              <span className="text-[9px] font-bold text-[#6C5CE7] uppercase tracking-widest bg-[#6C5CE7]/10 px-2.5 py-1 rounded-md">
                Insights Blog
              </span>
              <h2 className="text-xl font-bold text-gray-900 tracking-tight font-sans mt-3">
                ResearchFlow Publications
              </h2>
              <p className="text-xs text-gray-500 leading-relaxed mt-1 font-medium">
                Deep articles on ensuring factual citation tracing and utilizing visual analytics in scholarly research workflows.
              </p>
            </div>

            <div className="flex flex-col gap-4 max-h-[340px] overflow-y-auto pr-1">
              <article className="p-4 bg-white/65 border border-white rounded-2xl hover:border-[#6C5CE7]/20 transition-all cursor-pointer">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-[9px] font-bold bg-[#6C5CE7]/5 text-[#6C5CE7] px-2 py-0.5 rounded font-mono">FACTUAL RIGOR</span>
                  <span className="text-[9px] text-gray-400 font-medium">July 12, 2026</span>
                </div>
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-1">
                  Ensuring Factual Rigor in Scholarly Analysis Pipelines
                </h3>
                <p className="text-[11px] text-gray-500 leading-relaxed font-medium">
                  How strict layout grounding, section alignment, and real-time open-access citation verification keep generated reviews fully accurate.
                </p>
              </article>

              <article className="p-4 bg-white/65 border border-white rounded-2xl hover:border-[#4A90E2]/20 transition-all cursor-pointer">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-[9px] font-bold bg-[#4A90E2]/5 text-[#4A90E2] px-2 py-0.5 rounded font-mono">DOCUMENT VISUALS</span>
                  <span className="text-[9px] text-gray-400 font-medium">June 28, 2026</span>
                </div>
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-1">
                  The Critical Role of Image Grounding: Extracting Charts from PDFs
                </h3>
                <p className="text-[11px] text-gray-500 leading-relaxed font-medium">
                  Understanding formulas and visual diagrams is crucial for research. Why text-only analysis often fails where visual document reasoning excels.
                </p>
              </article>
            </div>
          </div>
        </div>
      )}

      {/* 3. WALKTHROUGH MODAL */}
      {showWalkthrough && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/35 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-xl glass rounded-3xl p-6 md:p-8 border border-white/50 shadow-2xl">
            <button
              onClick={() => setShowWalkthrough(false)}
              className="absolute top-5 right-5 p-1.5 rounded-full hover:bg-black/5 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-6">
              <span className="text-[9px] font-bold text-[#6C5CE7] uppercase tracking-widest bg-[#6C5CE7]/10 px-2.5 py-1 rounded-md">
                App Overview
              </span>
              <h2 className="text-xl font-bold text-gray-900 tracking-tight font-sans mt-3">
                How ResearchFlow Works
              </h2>
              <p className="text-xs text-gray-500 leading-relaxed mt-1 font-medium">
                A simple three-step walkthrough of your automated academic research workbench.
              </p>
            </div>

            <div className="flex flex-col gap-5 mb-4 text-xs font-medium">
              <div className="flex gap-4 items-start">
                <div className="w-7 h-7 bg-[#6C5CE7]/10 text-[#6C5CE7] font-bold flex items-center justify-center rounded-lg border border-[#6C5CE7]/20 shrink-0">1</div>
                <div className="flex flex-col gap-0.5">
                  <h4 className="font-bold text-gray-900 uppercase tracking-wider text-[11px]">Upload Your PDFs & Papers</h4>
                  <p className="text-gray-500 leading-relaxed text-[11px]">
                    Drag and drop or select PDF files inside any notebook. The engine parses the layout, indexes the paper sections, and runs visual description extraction of figures and charts.
                  </p>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <div className="w-7 h-7 bg-[#4A90E2]/10 text-[#4A90E2] font-bold flex items-center justify-center rounded-lg border border-[#4A90E2]/20 shrink-0">2</div>
                <div className="flex flex-col gap-0.5">
                  <h4 className="font-bold text-gray-900 uppercase tracking-wider text-[11px]">Query & Cross-Examine in Chat</h4>
                  <p className="text-gray-500 leading-relaxed text-[11px]">
                    Ask complex questions. The AI replies with definitions for complex terms and displays grounded citations in the Margin so you can inspect source passages.
                  </p>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <div className="w-7 h-7 bg-[#6C5CE7]/10 text-[#6C5CE7] font-bold flex items-center justify-center rounded-lg border border-[#6C5CE7]/20 shrink-0">3</div>
                <div className="flex flex-col gap-0.5">
                  <h4 className="font-bold text-gray-900 uppercase tracking-wider text-[11px]">Compile Cited Academic Reviews</h4>
                  <p className="text-gray-500 leading-relaxed text-[11px]">
                    Select a report template style, enter your review goal, and let the advanced compiler build your draft complete with automated Citation Fidelity checks.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setShowWalkthrough(false);
                setActiveLandingTab("new");
              }}
              className="w-full mt-4 py-2.5 bg-gradient-to-r from-[#6C5CE7] to-[#4A90E2] text-white text-[11px] font-bold uppercase tracking-wider rounded-xl hover:opacity-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
            >
              <span>Get Started Now</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
