import React, { useState, useRef } from "react";
import {
  UploadCloud,
  FileText,
  Compass,
  CheckCircle,
  HelpCircle,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  Globe,
} from "lucide-react";
import { Notebook } from "../types";

interface Props {
  notebook: Notebook;
  onUpdate: (updated: Notebook) => void;
}

export default function PaperList({ notebook, onUpdate }: Props) {
  const [isUploading, setIsUploading] = useState(false);
  const [isResolving, setIsResolving] = useState<string | null>(null);
  const [isCheckingFidelity, setIsCheckingFidelity] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFile(file);
  };

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    const formData = new FormData();
    formData.append("pdf", file);

    try {
      const res = await fetch(`/api/notebooks/${notebook.id}/upload`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        onUpdate(data.notebook);
      } else {
        const err = await res.json();
        alert(`Ingestion failed: ${err.error}`);
      }
    } catch (e) {
      console.error("Upload error", e);
      alert("Failed to connect to ingestion server.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const resolveCitations = async (paperId: string) => {
    setIsResolving(paperId);
    try {
      const res = await fetch(`/api/notebooks/${notebook.id}/papers/${paperId}/resolve-citations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxCitations: 5 }),
      });

      if (res.ok) {
        const data = await res.json();
        onUpdate(data.notebook);
      }
    } catch (e) {
      console.error("Resolve error", e);
    } finally {
      setIsResolving(null);
    }
  };

  const runFidelityCheck = async (paperId: string) => {
    setIsCheckingFidelity(paperId);
    try {
      const res = await fetch(`/api/notebooks/${notebook.id}/papers/${paperId}/fidelity-check`, {
        method: "POST",
      });

      if (res.ok) {
        const data = await res.json();
        onUpdate(data.notebook);
      }
    } catch (e) {
      console.error("Fidelity check error", e);
    } finally {
      setIsCheckingFidelity(null);
    }
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
    <div className="bg-white/55 backdrop-blur-md border border-white/90 rounded-2xl p-4 shadow-sm flex flex-col gap-4">
      <div className="flex items-center justify-between pb-2 border-b border-black/5">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[#6C5CE7]" />
          <h2 className="text-[12.5px] uppercase tracking-[0.09em] font-bold text-[#5B5570]">Source Papers</h2>
        </div>

        <div>
          <input
            type="file"
            accept="application/pdf"
            onChange={handleFileUpload}
            ref={fileInputRef}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="text-[11px] bg-gradient-to-r from-[#6C5CE7] to-[#4A90E2] hover:opacity-95 text-white px-3.5 py-1.5 rounded-xl font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-sm transition-all"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>{isUploading ? "Ingesting..." : "Upload Paper"}</span>
          </button>
        </div>
      </div>

      {notebook.papers.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-black/10 rounded-xl bg-[#F1EEF7]/30">
          <UploadCloud className="w-8 h-8 text-[#8B85A0]/60 mx-auto mb-2 animate-pulse" />
          <p className="text-xs text-[#8B85A0] font-medium px-4 leading-relaxed">
            Upload your first research PDF to index layout structure, extract tables, and build vectors.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {notebook.papers.map((p) => {
            const hasCitations = p.citations && p.citations.length > 0;
            return (
              <div
                key={p.id}
                className="border border-black/5 rounded-xl p-3 bg-white/40 hover:bg-white/70 transition-all duration-200 shadow-sm"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <div className="p-2 bg-[#6C5CE7]/10 rounded-lg text-[#6C5CE7] shrink-0 mt-0.5">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xs font-serif font-bold text-[#241F33] leading-snug truncate" title={p.title}>
                        {p.title}
                      </h3>
                      <p className="text-[9.5px] text-[#8B85A0] font-mono mt-0.5 uppercase tracking-wider">
                        Pages: {p.totalPages} | Ingested: {new Date(p.uploadedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-1.5 shrink-0 self-end sm:self-center">
                    {!p.citationResolved ? (
                      <button
                        onClick={() => resolveCitations(p.id)}
                        disabled={isResolving !== null}
                        className="text-[10px] font-bold text-[#6C5CE7] border border-[#6C5CE7]/15 hover:bg-[#6C5CE7]/5 px-2.5 py-1.5 rounded-lg cursor-pointer flex items-center gap-1 transition-all uppercase tracking-wider disabled:opacity-50"
                      >
                        <Compass className="w-3 h-3 animate-spin-slow" />
                        <span>{isResolving === p.id ? "Resolving..." : "Resolve Citations"}</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[#2F7D74] font-bold flex items-center gap-0.5 bg-teal-50 border border-teal-100 px-2 py-0.5 rounded-full">
                          <CheckCircle className="w-3 h-3" />
                          <span>Tracked</span>
                        </span>
                        <button
                          onClick={() => runFidelityCheck(p.id)}
                          disabled={isCheckingFidelity !== null}
                          className="text-[10px] font-bold text-[#4A90E2] border border-[#4A90E2]/15 hover:bg-[#4A90E2]/5 px-2.5 py-1 rounded-lg cursor-pointer flex items-center gap-1 uppercase tracking-wider disabled:opacity-50"
                        >
                          <ShieldCheck className="w-3 h-3" />
                          <span>{isCheckingFidelity === p.id ? "Checking..." : "Run Fidelity"}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Citations list with fidelity status */}
                {hasCitations && (
                  <div className="mt-3 pt-3 border-t border-black/5 flex flex-col gap-2">
                    <h4 className="text-[9px] font-bold text-[#8B85A0] tracking-[0.12em] uppercase">
                      Resolved References (Semantic Scholar Graph)
                    </h4>
                    <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-1">
                      {p.citations?.map((cit) => {
                        const fidelity = notebook.fidelityResults?.find(
                          (f) => f.citedPaperId === cit.id
                        );
                        return (
                          <div
                            key={cit.id}
                            className="bg-white/75 border border-black/5 rounded-lg p-2.5 flex flex-col gap-1 shadow-sm hover:bg-white transition-colors"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex flex-col min-w-0">
                                <span className="text-[11.5px] font-serif font-semibold text-[#241F33] truncate">
                                  {cit.title}
                                </span>
                                <span className="text-[9.5px] text-[#8B85A0] font-sans truncate">
                                  {cit.authors} ({cit.year || "n.d."}) | {cit.venue || "Unspecified Venue"}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {(cit.retracted || fidelity?.retracted) && (
                                  <span className="text-[8px] bg-red-100 text-red-700 border border-red-200 font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0 font-mono animate-pulse">
                                    ⚠️ Retracted
                                  </span>
                                )}
                                {cit.ingested && (
                                  <span className="text-[8px] bg-[#DCEEEA] text-[#2F7D74] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0 font-mono">
                                    <Globe className="w-2.5 h-2.5" />
                                    <span>Full Ingested</span>
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Fidelity auditing result */}
                            {fidelity && (
                              <div className="mt-1.5 pt-1.5 border-t border-dashed border-black/5 flex flex-col gap-1.5 bg-[#F1EEF7]/30 p-2.5 rounded-xl">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <span className="text-[8.5px] font-bold text-[#8B85A0] uppercase tracking-widest font-mono">
                                    Citation Fidelity Check
                                  </span>
                                  {getFidelityBadge(fidelity)}
                                </div>
                                <p className="text-[10.5px] font-serif text-[#5B5570] italic leading-normal">
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
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
