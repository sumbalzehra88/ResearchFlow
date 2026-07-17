import React, { useState, useRef, useEffect } from "react";
import { Send, FileText, Settings, Compass, Layers, Check, Download } from "lucide-react";
import { Notebook, ChatMessage, CitationSource, Report } from "../types";
import FormattedMarkdown from "./FormattedMarkdown";
import { exportReportToDocx } from "../lib/docxGenerator";

interface Props {
  notebook: Notebook;
  onUpdate: (updated: Notebook) => void;
}

export default function ChatPanel({ notebook, onUpdate }: Props) {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [complexity, setComplexity] = useState<"plain" | "dense">("dense");
  const [jargon, setJargon] = useState<"as-is" | "hover" | "plain-language">("hover");
  const [expandedMsgId, setExpandedMsgId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [localMessages, setLocalMessages] = useState<ChatMessage[]>(notebook.chatHistory);

  const handleExportChatToWord = (m: ChatMessage) => {
    const tempReport: Report = {
      id: m.id,
      title: `AI Chat Synthesis`,
      prompt: `Exported Chat conversation`,
      templateType: `full_report`,
      content: m.text,
      createdAt: m.timestamp || new Date().toISOString(),
      complexity: `dense`,
      jargon: `as-is`,
      references: (m.sources || []).map((s, idx) => ({
        citationKey: `Source ${idx + 1}`,
        title: s.paperTitle,
        authors: `Page ${s.page}`,
        fidelityJustification: s.text,
      }))
    };
    exportReportToDocx(tempReport);
  };

  useEffect(() => {
    setLocalMessages(notebook.chatHistory);
  }, [notebook.chatHistory]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages, isSending]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSending) return;

    const userPrompt = input;
    setInput("");
    setIsSending(true);

    const tempUserMsg: ChatMessage = {
      id: `msg_temp_user_${Date.now()}`,
      role: "user",
      text: userPrompt,
      timestamp: new Date().toISOString(),
      complexity,
      jargon,
    };

    setLocalMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await fetch(`/api/notebooks/${notebook.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userPrompt,
          complexity,
          jargon,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        onUpdate(data.notebook);
      } else {
        alert("Failed to get chat response. Token budget may have been exceeded.");
        setLocalMessages(notebook.chatHistory);
      }
    } catch (e) {
      console.error("Chat error", e);
      setLocalMessages(notebook.chatHistory);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div id="sec-chat" className="bg-white/55 backdrop-blur-md border border-white/90 rounded-2xl p-4 shadow-sm flex flex-col h-[520px]">
      
      {/* Response explainer controls header */}
      <div className="flex items-center justify-between pb-3.5 border-b border-black/5">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-[#6C5CE7]" />
          <h2 className="text-[12.5px] uppercase tracking-[0.09em] font-bold text-[#5B5570]">Deep-Research Chat</h2>
        </div>
      </div>

      {/* Viewport content */}
      <div className="flex-1 flex gap-4 min-h-0 py-3">
        {/* Chat Stream (Full Width) */}
        <div className="flex-1 flex flex-col min-h-0 bg-[#F1EEF7]/30 border border-black/[0.03] rounded-2xl p-3">
          <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1">
            {localMessages.length === 0 ? (
              <div className="text-center my-auto py-12">
                <Compass className="w-8 h-8 text-[#6C5CE7]/30 mx-auto mb-2 animate-spin-slow" />
                <p className="text-xs font-bold text-[#5B5570] uppercase tracking-wider">Ask the notebook anything</p>
                <p className="text-[11px] text-[#8B85A0] mt-1 max-w-[280px] mx-auto leading-relaxed font-medium">
                  Answers will be strictly verified and grounded using paper visual content, tables, and text layout structure.
                </p>
              </div>
            ) : (
              localMessages.map((m) => {
                const isUser = m.role === "user";
                const isExpanded = expandedMsgId === m.id;
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col gap-1 max-w-[90%] ${isUser ? "self-end items-end" : "self-start items-start"}`}
                  >
                    <div
                      className={`p-3 rounded-2xl w-full ${
                        isUser
                          ? "bg-[#241F33] text-white rounded-tr-none shadow-sm text-xs font-sans"
                          : "bg-white border border-black/5 text-[#241F33] shadow-sm rounded-tl-none text-sm font-serif leading-relaxed"
                      }`}
                    >
                      {isUser ? (
                        <p>{m.text}</p>
                      ) : (
                        <FormattedMarkdown
                          content={m.text}
                          onCitationClick={(num) => {
                            setExpandedMsgId(m.id);
                          }}
                        />
                      )}
                    </div>

                    {!isUser && (
                      <div className="w-full mt-1 flex flex-col">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          {m.sources && m.sources.length > 0 ? (
                            <button
                              onClick={() => setExpandedMsgId(isExpanded ? null : m.id)}
                              className="text-[10px] font-bold text-[#6C5CE7] hover:text-[#4A90E2] transition-colors flex items-center gap-1 cursor-pointer uppercase tracking-wider"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>
                                {isExpanded ? "Hide grounded sources" : `View grounded sources (${m.sources.length})`}
                              </span>
                            </button>
                          ) : (
                            <div />
                          )}

                          <button
                            onClick={() => handleExportChatToWord(m)}
                            className="text-[10px] font-bold text-[#6C5CE7] hover:text-[#4A90E2] transition-colors flex items-center gap-1 cursor-pointer uppercase tracking-wider ml-auto"
                            title="Export this AI answer to a formatted Word document (.docx)"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Export Word (.docx)</span>
                          </button>
                        </div>

                        {isExpanded && m.sources && m.sources.length > 0 && (
                          <div className="mt-2 flex flex-col gap-2 w-full bg-[#F1EEF7]/40 border border-black/[0.03] rounded-xl p-2.5">
                            {m.sources.map((s, idx) => (
                              <div
                                key={idx}
                                className="bg-white border border-black/5 rounded-lg p-2 flex flex-col gap-1 shadow-sm"
                              >
                                <div className="flex items-center justify-between border-b border-black/5 pb-1">
                                  <span className="text-[9px] font-sans font-bold text-[#8B85A0]">
                                    Source #{idx + 1}
                                  </span>
                                  <span className="text-[8px] bg-black/5 text-[#5B5570] px-1.5 py-0.5 rounded font-mono uppercase font-bold tracking-wider">
                                    p{s.page}
                                  </span>
                                </div>
                                <p className="text-[10px] font-serif text-[#5B5570] italic leading-relaxed">
                                  "{s.text}"
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {isSending && (
              <div className="flex flex-col gap-1 max-w-[90%] self-start items-start animate-pulse">
                <div className="p-3.5 rounded-2xl bg-white border border-black/5 text-[#241F33] shadow-sm rounded-tl-none flex items-center gap-2">
                  <div className="flex gap-1 shrink-0">
                    <span className="w-1.5 h-1.5 bg-[#6C5CE7] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-[#6C5CE7] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-[#6C5CE7] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                  <span className="text-[10.5px] text-[#8B85A0] font-bold uppercase tracking-wider font-sans">Drafting response...</span>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          <form onSubmit={handleSend} className="flex gap-2 mt-2.5">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Query paper results, figures, or mathematical derivations..."
              disabled={isSending}
              className="flex-1 text-xs border border-black/10 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-1 focus:ring-[#6C5CE7] bg-white text-[#241F33] placeholder:text-black/30 leading-normal"
            />
            <button
              type="submit"
              disabled={isSending || !input.trim()}
              className="text-white bg-[#241F33] hover:opacity-90 p-2.5 rounded-xl flex items-center justify-center cursor-pointer disabled:opacity-50 transition-all shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
