import React, { useState, useEffect } from "react";
import { FolderOpen, Plus, Trash2, Calendar, ChevronDown, ChevronUp } from "lucide-react";
import { Notebook } from "../types";

interface Props {
  activeNotebook: Notebook | null;
  onSelect: (notebook: Notebook) => void;
}

export default function NotebookSelector({ activeNotebook, onSelect }: Props) {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [newNotebookName, setNewNotebookName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  const loadNotebooks = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/notebooks");
      if (res.ok) {
        const data = await res.json();
        setNotebooks(data);
        if (data.length > 0 && !activeNotebook) {
          onSelect(data[0]);
        }
      }
    } catch (e) {
      console.error("Failed to load notebooks", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadNotebooks();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
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
        onSelect(created);
        setNewNotebookName("");
        setIsCreating(false);
        setIsOpen(false);
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

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this notebook and all associated papers?")) return;

    try {
      const res = await fetch(`/api/notebooks/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setNotebooks((prev) => prev.filter((n) => n.id !== id));
        if (activeNotebook?.id === id) {
          onSelect(null as any);
        }
      }
    } catch (e) {
      console.error("Failed to delete notebook", e);
    }
  };

  return (
    <div className="bg-white/55 backdrop-blur-md border border-white/90 rounded-2xl p-4 shadow-sm flex flex-col relative">
      {/* Sleek Switcher Header from Mockup */}
      <div
        className="flex items-center gap-3 cursor-pointer select-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="nb-swatch shrink-0"></div>
        <div className="flex-1 min-w-0">
          <div className="font-sans font-bold text-[13.5px] text-[#241F33] truncate">
            {activeNotebook?.name || "Select Notebook"}
          </div>
          <div className="text-[11px] text-[#8B85A0] font-semibold">Switch notebook</div>
        </div>
        <div className="text-[#8B85A0] shrink-0 ml-2">
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {isOpen && (
        <div className="mt-4 pt-3 border-t border-black/5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-bold text-[#5B5570] uppercase tracking-[0.08em]">Notebook Hub</h3>
            <button
              onClick={() => setIsCreating(!isCreating)}
              className="text-[10px] font-bold text-[#6C5CE7] hover:text-[#4A90E2] uppercase tracking-wider flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>New Project</span>
            </button>
          </div>

          {isCreating && (
            <form onSubmit={handleCreate} className="flex gap-1.5">
              <input
                type="text"
                value={newNotebookName}
                onChange={(e) => setNewNotebookName(e.target.value)}
                placeholder="Notebook name..."
                className="flex-1 text-xs border border-black/10 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#6C5CE7] bg-white text-black/80 placeholder:text-black/30"
                autoFocus
              />
              <button
                type="submit"
                className="text-xs bg-gradient-to-r from-[#6C5CE7] to-[#4A90E2] text-white px-3 py-1.5 rounded-lg font-semibold cursor-pointer shadow-sm hover:opacity-90"
              >
                Create
              </button>
            </form>
          )}

          {isLoading ? (
            <div className="text-center py-4 text-xs text-[#8B85A0] font-mono">Loading notebooks...</div>
          ) : notebooks.length === 0 ? (
            <div className="text-center py-6 border border-dashed border-black/10 rounded-xl">
              <FolderOpen className="w-6 h-6 text-[#8B85A0]/50 mx-auto mb-1.5" />
              <p className="text-xs text-[#8B85A0] font-medium px-4">No notebooks found.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1 max-h-[180px] overflow-y-auto pr-1">
              {notebooks.map((nb) => {
                const isSelected = activeNotebook?.id === nb.id;
                return (
                  <div
                    key={nb.id}
                    onClick={() => {
                      onSelect(nb);
                      setIsOpen(false);
                    }}
                    className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-all ${
                      isSelected
                        ? "bg-white shadow-sm border border-black/10 text-[#6C5CE7]"
                        : "hover:bg-white/40 border border-transparent text-black/70"
                    }`}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className={`text-xs font-semibold truncate ${isSelected ? "text-black/90 font-bold" : "text-black/70"}`}>
                        {nb.name}
                      </span>
                      <span className="text-[10px] text-[#8B85A0] flex items-center gap-1 font-mono uppercase tracking-wider">
                        <Calendar className="w-2.5 h-2.5" />
                        {new Date(nb.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <button
                      onClick={(e) => handleDelete(nb.id, e)}
                      className="p-1 rounded-md hover:bg-black/5 text-black/20 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
