import React, { useState, useMemo } from "react";
import {
  Wand2,
  FileText,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  XCircle,
  Download,
} from "lucide-react";
import { Notebook, Report } from "../types";
import FormattedMarkdown from "./FormattedMarkdown";
import { exportReportToDocx } from "../lib/docxGenerator";

interface Props {
  notebook: Notebook;
  onUpdate: (updated: Notebook) => void;
}

type TemplateType = "executive_summary" | "literature_review" | "methods_critique" | "full_report";

export default function ReportPanel({ notebook, onUpdate }: Props) {
  const [prompt, setPrompt] = useState("");
  const [templateType, setTemplateType] = useState<TemplateType>("executive_summary");
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeReport, setActiveReport] = useState<Report | null>(null);

  const fidelityMap = useMemo(() => {
    if (!activeReport || !activeReport.references) return {};
    const map: Record<number, { 
      status: string; 
      justification: string;
      divergence_type?: string;
      divergence_description?: string;
      retracted?: boolean;
    }> = {};
    activeReport.references.forEach((ref, idx) => {
      const num = idx + 1;
      map[num] = {
        status: ref.fidelity || "Unverifiable",
        justification: ref.fidelityJustification || "Claim not verified.",
        divergence_type: ref.divergence_type,
        divergence_description: ref.divergence_description,
        retracted: ref.retracted,
      };
    });
    return map;
  }, [activeReport]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    try {
      const res = await fetch(`/api/notebooks/${notebook.id}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          templateType,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        onUpdate(data.notebook);
        // Find newly created report
        const newRep = data.notebook.reports[data.notebook.reports.length - 1];
        setActiveReport(newRep);
        setPrompt("");
      } else {
        alert("Report generation failed. Token budget exceeded.");
      }
    } catch (e) {
      console.error("Report gen error", e);
    } finally {
      setIsGenerating(false);
    }
  };

  const getFidelityBadge = (ref: any) => {
    const status = ref.fidelity || "Unverifiable";
    const retracted = ref.retracted;
    const divergence_type = ref.divergence_type;

    let badgeText = status;
    if ((status === "Partially supported" || status === "Unsupported") && divergence_type) {
      const formattedType = divergence_type.replace(/_/g, " ");
      badgeText = `${status} — ${formattedType}`;
    }

    let badgeClass = "fidelity unverifiable";
    if (status === "Supported") badgeClass = "fidelity supported";
    else if (status === "Unsupported") badgeClass = "fidelity unsupported";

    return (
      <div className="flex items-center gap-1.5 flex-wrap shrink-0">
        {retracted && (
          <span className="bg-red-500 text-white font-extrabold text-[8.5px] px-2 py-0.5 rounded uppercase tracking-wider animate-pulse">
            ⚠️ Retracted
          </span>
        )}
        <span className={badgeClass}>{badgeText}</span>
      </div>
    );
  };

  const templates: { id: TemplateType; label: string }[] = [
    { id: "executive_summary", label: "Executive Summary" },
    { id: "literature_review", label: "Literature Review" },
    { id: "methods_critique", label: "Methods Critique" },
    { id: "full_report", label: "Full Report" },
  ];

  return (
    <div id="sec-report" className="bg-white/55 backdrop-blur-md border border-white/90 rounded-2xl p-4 shadow-sm flex flex-col gap-4">
      <div className="flex items-center justify-between pb-2 border-b border-black/5">
        <div className="flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-[#6C5CE7]" />
          <h2 className="text-[12.5px] uppercase tracking-[0.09em] font-bold text-[#5B5570]">Report Compiler</h2>
        </div>
        <span className="text-[11px] text-[#8B85A0] font-semibold">Literature review · draft</span>
      </div>

      {/* Styled compiler tabs matching mockup */}
      <div className="report-tabs">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`rtab ${templateType === t.id ? "active" : ""}`}
            onClick={() => setTemplateType(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
        {/* Left Input Section */}
        <div className="md:col-span-5 flex flex-col gap-4 border-b md:border-b-0 md:border-r border-black/5 pb-4 md:pb-0 md:pr-5">
          <form onSubmit={handleGenerate} className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <label className="text-[9.5px] font-bold text-[#8B85A0] uppercase tracking-widest font-mono">
                Report Goal / Objectives
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your review goals (e.g. Compare memory scaling patterns and token limits)..."
                rows={4}
                className="text-xs border border-black/10 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-[#6C5CE7] bg-white/70 text-[#241F33] placeholder:text-black/30 leading-relaxed"
              />
            </div>

            <button
              type="submit"
              disabled={isGenerating || !prompt.trim() || notebook.papers.length === 0}
              className="text-white text-[11px] font-bold uppercase tracking-wider py-3 rounded-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-sm transition-all bg-[#241F33] hover:opacity-95"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>{isGenerating ? "Compiling..." : "Compile Grounded Report"}</span>
            </button>
          </form>

          {/* Historic Reports */}
          {notebook.reports.length > 0 && (
            <div className="mt-2 flex flex-col gap-2">
              <span className="text-[9.5px] font-bold text-[#8B85A0] uppercase tracking-widest font-mono">
                Historical Reports
              </span>
              <div className="flex flex-col gap-1 max-h-[160px] overflow-y-auto pr-1">
                {notebook.reports.map((rep) => {
                  const isActive = activeReport?.id === rep.id;
                  return (
                    <button
                      key={rep.id}
                      onClick={() => setActiveReport(rep)}
                      className={`text-left text-[11.5px] font-semibold p-2.5 rounded-xl transition-all line-clamp-1 border ${
                        isActive
                          ? "bg-white border border-black/10 text-[#6C5CE7] shadow-sm font-bold"
                          : "hover:bg-white/40 border-transparent text-[#5B5570]"
                      }`}
                    >
                      {rep.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Preview Section */}
        <div className="md:col-span-7 flex flex-col gap-4 min-h-[300px]">
          {activeReport ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3 border-b border-black/5 pb-2.5">
                <div className="flex flex-col">
                  <h3 className="text-sm font-serif font-bold text-[#241F33] leading-snug">
                    {activeReport.title}
                  </h3>
                  <p className="text-[9px] text-[#8B85A0] font-mono mt-0.5 uppercase tracking-wider">
                    Style: {activeReport.templateType.replace(/_/g, " ").toUpperCase()} | Compiled:{" "}
                    {new Date(activeReport.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => exportReportToDocx(activeReport)}
                  className="flex items-center gap-1.5 text-[10px] text-[#6C5CE7] hover:text-white bg-[#6C5CE7]/10 hover:bg-[#6C5CE7] border border-[#6C5CE7]/15 px-2.5 py-1.5 rounded-lg font-bold uppercase tracking-wider transition-all cursor-pointer shrink-0"
                  title="Download report as fully formatted Word document (.docx)"
                >
                  <Download className="w-3 h-3" />
                  <span>Download (.docx)</span>
                </button>
              </div>

              {/* Markdown content */}
              <div className="font-serif text-[#241F33] text-xs leading-relaxed select-text pr-1 max-h-[340px] overflow-y-auto">
                <FormattedMarkdown
                  content={activeReport.content}
                  fidelityMap={fidelityMap}
                  onCitationClick={(num) => {
                    const el = document.getElementById(`ref-card-${num - 1}`);
                    if (el) {
                      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
                      el.classList.add("ring-2", "ring-[#6C5CE7]/30", "scale-[1.01]");
                      setTimeout(() => {
                        el.classList.remove("ring-2", "ring-[#6C5CE7]/30", "scale-[1.01]");
                      }, 2000);
                    }
                  }}
                />
              </div>

              {/* Verified citations matching the HTML mockup design */}
              {activeReport.references && activeReport.references.length > 0 && (
                <div className="mt-4 pt-3 border-t border-black/5 flex flex-col gap-3">
                  <h4 className="text-[9.5px] font-bold text-[#8B85A0] tracking-wider uppercase font-mono">
                    Citations Verified in Reference Material
                  </h4>
                  <div className="flex flex-col gap-2.5">
                    {activeReport.references.map((ref, idx) => {
                      return (
                        <div
                          key={idx}
                          id={`ref-card-${idx}`}
                          className="ref-card border border-black/5 rounded-2xl p-3.5 bg-white/45 shadow-sm transition-all duration-300"
                        >
                          <div className="ref-top flex items-start justify-between gap-3 mb-2">
                            <span className="ref-name font-serif font-bold text-xs text-[#241F33]">
                              [{ref.citationKey}] {ref.title}
                            </span>
                            {getFidelityBadge(ref)}
                          </div>
                          
                          <p className="ref-just text-[11.5px] font-sans text-[#5B5570] leading-normal font-medium bg-white/70 p-2.5 rounded-xl border border-black/[0.03]">
                            {ref.fidelityJustification || "No claim verification feedback logged yet."}
                            {ref.divergence_description && (
                              <span className="block mt-1.5 text-[10.5px] text-[#8B85A0] font-sans font-semibold">
                                ⚠️ Divergence details: {ref.divergence_description}
                              </span>
                            )}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="my-auto text-center py-14 bg-white/20 border border-dashed border-black/5 rounded-2xl p-6">
              <FileText className="w-8 h-8 text-[#6C5CE7]/20 mx-auto mb-2" />
              <p className="text-xs font-bold text-[#5B5570] uppercase tracking-wider">No report loaded</p>
              <p className="text-[10.5px] text-[#8B85A0] max-w-[280px] mx-auto mt-1.5 leading-relaxed font-medium">
                Describe your research objective and click "Compile" to generate a fully cited, grounded, academic review based on uploaded PDFs.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
