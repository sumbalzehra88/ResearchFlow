import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Play,
  Pause,
  Search,
  BookOpen,
  Sparkles,
  CheckCircle,
  Network,
  X
} from "lucide-react";
import { Notebook, ResolvedCitation } from "../types";

const normalizeTitle = (title: string) => title.toLowerCase().replace(/[^a-z0-9]/g, "").trim();

function getDeterministicRandom(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const x = Math.sin(hash) * 10000;
  return x - Math.floor(x);
}

interface Props {
  notebook: Notebook;
  onUpdate: (updated: Notebook) => void;
}

interface PhysicsNode {
  id: string;
  title: string;
  authors?: string;
  year?: number;
  isIngested: boolean;
  paperId?: string; // Links back to primary paper if available
  citationObj?: ResolvedCitation;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  isDragging?: boolean;
}

interface PhysicsEdge {
  id: string;
  source: string; // node ID
  target: string; // node ID
  particleProgress: number; // For rendering animated particle pulses [0, 1]
  particleSpeed: number;
}

export default function CitationGraph({ notebook }: Props) {
  const [isOpen, setIsOpen] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Dynamic floating tooltip position relative to mouse coords with boundaries check
  const tooltipStyle = useMemo(() => {
    if (!hoveredNodeId) return {};
    
    const canvas = canvasRef.current;
    const width = canvas ? canvas.clientWidth : 500;
    const height = canvas ? canvas.clientHeight : 380;
    
    const tooltipWidth = 260;
    const tooltipHeight = 140;
    
    let left = mousePos.x + 16;
    let top = mousePos.y + 16;
    
    // Shift left if reaching right edge of canvas container
    if (left + tooltipWidth > width) {
      left = mousePos.x - tooltipWidth - 16;
    }
    // Shift up if reaching bottom edge of canvas container
    if (top + tooltipHeight > height) {
      top = mousePos.y - tooltipHeight - 16;
    }
    
    // Safety clamp within canvas container boundaries with 10px padding
    left = Math.max(10, Math.min(left, width - tooltipWidth - 10));
    top = Math.max(10, Math.min(top, height - tooltipHeight - 10));
    
    return {
      left: `${left}px`,
      top: `${top}px`,
    };
  }, [hoveredNodeId, mousePos]);

  // Pan and Zoom State
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 0.95 });
  const transformRef = useRef({ x: 0, y: 0, scale: 0.95 });
  useEffect(() => {
    transformRef.current = transform;
  }, [transform]);

  // Keep physics node coordinates stable across react renders using a ref
  const nodesRef = useRef<{ [id: string]: PhysicsNode }>({});
  const edgesRef = useRef<PhysicsEdge[]>([]);

  // 1. Build & synchronize Graph Data from Notebook Papers and Citations
  const graphData = useMemo(() => {
    const papers = notebook.papers;
    const nodesMap: { [id: string]: { title: string; authors?: string; year?: number; isIngested: boolean; paperId?: string; citationObj?: ResolvedCitation } } = {};
    const edges: { source: string; target: string; id: string }[] = [];

    // Helper to normalize title for fuzzy/merging match
    const normalize = (title: string) => title.toLowerCase().replace(/[^a-z0-9]/g, "").trim();

    // Map of normalized titles to primary Paper IDs to merge cited duplicates with ingested papers
    const primaryTitleToIdMap = new Map<string, string>();

    // First pass: Add all primary papers
    for (const p of papers) {
      nodesMap[p.id] = {
        title: p.title,
        isIngested: true,
        paperId: p.id,
      };
      primaryTitleToIdMap.set(normalize(p.title), p.id);
    }

    // Second pass: Process citation links
    for (const p of papers) {
      if (p.citations && p.citations.length > 0) {
        for (const cit of p.citations) {
          const normCitTitle = normalize(cit.title);
          
          let targetNodeId = cit.id;
          let isTargetIngested = cit.ingested || false;

          // Merge if this citation is actually one of our ingested papers
          if (primaryTitleToIdMap.has(normCitTitle)) {
            targetNodeId = primaryTitleToIdMap.get(normCitTitle)!;
            isTargetIngested = true;
            if (nodesMap[targetNodeId]) {
              if (cit.authors && !nodesMap[targetNodeId].authors) {
                nodesMap[targetNodeId].authors = cit.authors;
              }
              if (cit.year && !nodesMap[targetNodeId].year) {
                nodesMap[targetNodeId].year = cit.year;
              }
            }
          } else {
            // Otherwise, check if we need to add this cited paper as an external node
            if (!nodesMap[cit.id]) {
              nodesMap[cit.id] = {
                title: cit.title,
                authors: cit.authors,
                year: cit.year,
                isIngested: false,
                citationObj: cit,
              };
            }
          }

          // Create edge from the citing paper to the target node
          const edgeId = `${p.id}->${targetNodeId}`;
          if (!edges.some(e => e.id === edgeId)) {
            edges.push({
              source: p.id,
              target: targetNodeId,
              id: edgeId,
            });
          }
        }
      }
    }

    return { nodesMap, edges };
  }, [notebook.papers]);

  // Synchronize canvas physics nodes with memoized graph structures
  useEffect(() => {
    const currentNodes = nodesRef.current;
    const newNodesMap: { [id: string]: PhysicsNode } = {};

    // Determine viewport center for starting coordinates
    const canvas = canvasRef.current;
    const width = canvas ? canvas.clientWidth : 500;
    const height = canvas ? canvas.clientHeight : 380;
    const cx = width / 2;
    const cy = height / 2;

    // Synchronize nodes
    Object.keys(graphData.nodesMap).forEach((id) => {
      const gNode = graphData.nodesMap[id];
      const isIngested = gNode.isIngested;
      
      // Fallback: look for a node with matching normalized title if exact ID isn't found
      let existingNode = currentNodes[id];
      if (!existingNode && gNode.title) {
        const normCurrent = normalizeTitle(gNode.title);
        const matchId = Object.keys(currentNodes).find(
          (oldId) => normalizeTitle(currentNodes[oldId].title) === normCurrent
        );
        if (matchId) {
          existingNode = currentNodes[matchId];
        }
      }

      if (existingNode) {
        // Keep existing positions/velocities
        newNodesMap[id] = {
          ...existingNode,
          id, // use the current synchronized node id
          title: gNode.title,
          authors: gNode.authors,
          year: gNode.year,
          isIngested,
          citationObj: gNode.citationObj,
          radius: isIngested ? 16 : 12,
        };
      } else {
        // Create new coordinates with a fully deterministic spiral/cluster distribution
        const angleSeed = getDeterministicRandom(id + "-angle");
        const radiusSeed = getDeterministicRandom(id + "-radius");
        const angle = angleSeed * Math.PI * 2;
        const radiusDist = 35 + radiusSeed * 90;
        newNodesMap[id] = {
          id,
          title: gNode.title,
          authors: gNode.authors,
          year: gNode.year,
          isIngested,
          citationObj: gNode.citationObj,
          x: cx + Math.cos(angle) * radiusDist,
          y: cy + Math.sin(angle) * radiusDist,
          vx: 0,
          vy: 0,
          radius: isIngested ? 16 : 12,
        };
      }
    });

    nodesRef.current = newNodesMap;

    // Synchronize edges with flow animation properties
    edgesRef.current = graphData.edges.map((e) => {
      const existing = edgesRef.current.find((ex) => ex.id === e.id);
      const seedProgress = getDeterministicRandom(e.id + "-progress");
      const seedSpeed = getDeterministicRandom(e.id + "-speed");
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        particleProgress: existing ? existing.particleProgress : seedProgress,
        particleSpeed: 0.004 + seedSpeed * 0.006,
      };
    });
  }, [graphData]);

  // 2. Physics Simulation Loop (Force-Directed Spring Embedder)
  useEffect(() => {
    let animId: number;

    const tick = () => {
      const nodes = Object.values(nodesRef.current) as PhysicsNode[];
      const edges = edgesRef.current;

      if (isPlaying && nodes.length > 0) {
        const kRepel = 1200; // Force repelling nodes
        const kAttract = 0.04; // Spring strength
        const restLength = 90; // Preferred link distance
        const kGravity = 0.025; // Pull towards center

        // Find center
        const canvas = canvasRef.current;
        const width = canvas ? canvas.clientWidth : 500;
        const height = canvas ? canvas.clientHeight : 380;
        const cx = width / 2;
        const cy = height / 2;

        // 1. Repulsion between all node pairs
        for (let i = 0; i < nodes.length; i++) {
          const n1 = nodes[i];
          for (let j = i + 1; j < nodes.length; j++) {
            const n2 = nodes[j];
            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const distSq = dx * dx + dy * dy + 0.1;
            const dist = Math.sqrt(distSq);

            if (dist < 220) {
              const force = kRepel / distSq;
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;

              if (!n1.isDragging) {
                n1.vx -= fx;
                n1.vy -= fy;
              }
              if (!n2.isDragging) {
                n2.vx += fx;
                n2.vy += fy;
              }
            }
          }
        }

        // 2. Attraction along edges
        for (const edge of edges) {
          const nSource = nodesRef.current[edge.source];
          const nTarget = nodesRef.current[edge.target];
          if (!nSource || !nTarget) continue;

          const dx = nTarget.x - nSource.x;
          const dy = nTarget.y - nSource.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;
          const displacement = dist - restLength;
          const force = displacement * kAttract;

          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (!nSource.isDragging) {
            nSource.vx += fx;
            nSource.vy += fy;
          }
          if (!nTarget.isDragging) {
            nTarget.vx -= fx;
            nTarget.vy -= fy;
          }
        }

        // 3. Gravity towards the viewport center
        for (const node of nodes) {
          if (node.isDragging) continue;
          node.vx += (cx - node.x) * kGravity;
          node.vy += (cy - node.y) * kGravity;
        }

        // 4. Update coordinates & apply damping
        const damp = 0.82;
        for (const node of nodes) {
          if (node.isDragging) continue;
          node.x += node.vx;
          node.y += node.vy;
          node.vx *= damp;
          node.vy *= damp;
        }
      }

      // 5. Update flow animation particles
      for (const edge of edges) {
        edge.particleProgress += edge.particleSpeed;
        if (edge.particleProgress > 1) {
          edge.particleProgress = 0;
        }
      }

      draw();
      animId = requestAnimationFrame(tick);
    };

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      const ratio = window.devicePixelRatio || 1;
      if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
        canvas.width = width * ratio;
        canvas.height = height * ratio;
        ctx.scale(ratio, ratio);
      } else {
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      }

      ctx.clearRect(0, 0, width, height);

      // Draw subtle micro-grid matching organic landscape theme
      ctx.save();
      ctx.strokeStyle = "rgba(108, 92, 231, 0.03)";
      ctx.lineWidth = 1;
      const gridSize = 40;
      const panX = transformRef.current.x;
      const panY = transformRef.current.y;
      const scale = transformRef.current.scale;

      const startGridX = (panX % (gridSize * scale)) - (gridSize * scale);
      const startGridY = (panY % (gridSize * scale)) - (gridSize * scale);

      for (let x = startGridX; x < width + gridSize * scale; x += gridSize * scale) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = startGridY; y < height + gridSize * scale; y += gridSize * scale) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
      ctx.restore();

      // Begin camera transform scope
      ctx.save();
      ctx.translate(panX, panY);
      ctx.scale(scale, scale);

      const nodes = Object.values(nodesRef.current) as PhysicsNode[];
      const edges = edgesRef.current;

      const activeNodeId = selectedNodeId || hoveredNodeId;
      const neighbors = new Set<string>();
      if (activeNodeId) {
        neighbors.add(activeNodeId);
        for (const e of edges) {
          if (e.source === activeNodeId) neighbors.add(e.target);
          if (e.target === activeNodeId) neighbors.add(e.source);
        }
      }

      // Draw edges (Lines)
      for (const edge of edges) {
        const src = nodesRef.current[edge.source];
        const tgt = nodesRef.current[edge.target];
        if (!src || !tgt) continue;

        const isEdgeConnectedToActive = activeNodeId === null || edge.source === activeNodeId || edge.target === activeNodeId;
        
        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);
        
        if (isEdgeConnectedToActive) {
          const isIngestedLink = src.isIngested && tgt.isIngested;
          ctx.strokeStyle = isIngestedLink ? "rgba(108, 92, 231, 0.75)" : "rgba(74, 144, 226, 0.65)";
          ctx.lineWidth = activeNodeId ? 2.2 : 1.5;
        } else {
          ctx.strokeStyle = "rgba(108, 92, 231, 0.04)";
          ctx.lineWidth = 0.6;
        }
        ctx.stroke();

        // Draw small directional citation flow particles
        if (isEdgeConnectedToActive && activeNodeId) {
          const px = src.x + (tgt.x - src.x) * edge.particleProgress;
          const py = src.y + (tgt.y - src.y) * edge.particleProgress;
          
          ctx.beginPath();
          ctx.arc(px, py, 2.8, 0, Math.PI * 2);
          ctx.fillStyle = src.isIngested ? "#6C5CE7" : "#4A90E2";
          ctx.shadowColor = src.isIngested ? "#6C5CE7" : "#4A90E2";
          ctx.shadowBlur = 8;
          ctx.fill();
          ctx.shadowBlur = 0; // Clear shadow
        }
      }

      // Draw nodes
      for (const node of nodes) {
        const isSelected = selectedNodeId === node.id;
        const isHovered = hoveredNodeId === node.id;
        const isHighlighted = activeNodeId === null || neighbors.has(node.id);
        const matchesSearch = searchQuery ? node.title.toLowerCase().includes(searchQuery.toLowerCase()) : false;

        ctx.save();
        ctx.globalAlpha = isHighlighted ? 1.0 : 0.15;

        // Selected/hovered halos
        if (isSelected || isHovered || matchesSearch) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius + (isSelected ? 7 : 5), 0, Math.PI * 2);
          ctx.fillStyle = matchesSearch 
            ? "rgba(251, 220, 235, 0.4)" 
            : isSelected 
              ? "rgba(108, 92, 231, 0.18)" 
              : "rgba(108, 92, 231, 0.1)";
          ctx.strokeStyle = matchesSearch 
            ? "#E29BBF" 
            : isSelected 
              ? "#6C5CE7" 
              : "rgba(108, 92, 231, 0.5)";
          ctx.lineWidth = isSelected ? 2.0 : 1.0;
          ctx.fill();
          ctx.stroke();

          if (isSelected) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius + 11, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(108, 92, 231, 0.35)";
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }

        // Draw node body
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);

        // Compute tag/label inside the node instead of generic emojis (e.g., first letter of author + year)
        let labelTag = "";
        let initial = "";
        if (node.authors) {
          const match = node.authors.match(/[A-Z][a-zA-Z]+/);
          if (match) {
            initial = match[0].substring(0, 1).toUpperCase();
          }
        }
        if (!initial && node.title) {
          const match = node.title.match(/[a-zA-Z]/);
          if (match) {
            initial = match[0].toUpperCase();
          }
        }
        if (node.year) {
          labelTag = `${initial}${String(node.year).slice(-2)}`;
        } else {
          labelTag = initial || "?";
        }

        // Meaningful color coding
        let fillStyle: string | CanvasGradient = "";
        let strokeStyle = "";
        let textStyle = "";

        if (node.isIngested) {
          // Primary core papers
          const grad = ctx.createRadialGradient(node.x - 2, node.y - 2, 1, node.x, node.y, node.radius);
          grad.addColorStop(0, "#8C7FF2");
          grad.addColorStop(1, "#6C5CE7");
          fillStyle = grad;
          strokeStyle = isSelected ? "#FFFFFF" : "rgba(108, 92, 231, 0.9)";
          textStyle = "#FFFFFF";
        } else {
          const status = node.citationObj?.status;
          const isIngestedElsewhere = node.citationObj?.ingested;

          if (isIngestedElsewhere) {
            fillStyle = "#D1FAE5";
            strokeStyle = isSelected ? "#059669" : "rgba(16, 185, 129, 0.85)";
            textStyle = "#065F46";
          } else if (status === "resolved") {
            // Light blue theme for successfully resolved citations with abstracts
            fillStyle = "#E0F2FE";
            strokeStyle = isSelected ? "#0284C7" : "rgba(14, 165, 233, 0.85)";
            textStyle = "#0369A1";
          } else if (status === "pending") {
            // Warm Amber for baseline references
            fillStyle = "#FEF3C7";
            strokeStyle = isSelected ? "#D97706" : "rgba(245, 158, 11, 0.85)";
            textStyle = "#92400E";
          } else {
            // Slate/Gray for unresolved or failed metadata
            fillStyle = "#F1F5F9";
            strokeStyle = isSelected ? "#475569" : "rgba(148, 163, 184, 0.85)";
            textStyle = "#475569";
          }
        }

        ctx.fillStyle = fillStyle;
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.fill();
        ctx.stroke();

        ctx.font = "bold 8px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = textStyle;
        ctx.fillText(labelTag, node.x, node.y);

        const isNodeConnected = activeNodeId === null || neighbors.has(node.id);
        const shouldShowLabel = isNodeConnected && (isHovered || isSelected || matchesSearch || scale > 1.15);
        
        if (shouldShowLabel) {
          ctx.font = isSelected ? "bold 10px sans-serif" : "9px sans-serif";
          ctx.fillStyle = isSelected ? "#1A1A1A" : "rgba(26, 26, 26, 0.8)";
          ctx.textAlign = "center";
          ctx.textBaseline = "top";

          let labelText = node.title;
          if (labelText.length > 25) {
            labelText = labelText.substring(0, 22) + "...";
          }

          const txtWidth = ctx.measureText(labelText).width;
          ctx.fillStyle = isSelected ? "rgba(255, 255, 255, 0.95)" : "rgba(255, 255, 255, 0.85)";
          ctx.fillRect(node.x - txtWidth / 2 - 4, node.y + node.radius + 3, txtWidth + 8, 14);

          ctx.fillStyle = isSelected ? "#6C5CE7" : "#1A1A1A";
          ctx.fillText(labelText, node.x, node.y + node.radius + 5);
        }

        ctx.restore();
      }

      ctx.restore();
    };

    tick();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isPlaying, selectedNodeId, hoveredNodeId, searchQuery, transform]);

  const isDraggingViewport = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const dragNodeId = useRef<string | null>(null);

  const getCanvasMouseCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const screenToGraphCoords = (screenX: number, screenY: number) => {
    const t = transformRef.current;
    return {
      x: (screenX - t.x) / t.scale,
      y: (screenY - t.y) / t.scale,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasMouseCoords(e);
    const graphCoords = screenToGraphCoords(coords.x, coords.y);

    let clickedNodeId: string | null = null;
    const nodes = Object.values(nodesRef.current) as PhysicsNode[];
    for (const node of nodes) {
      const dx = graphCoords.x - node.x;
      const dy = graphCoords.y - node.y;
      if (dx * dx + dy * dy <= node.radius * node.radius) {
        clickedNodeId = node.id;
        break;
      }
    }

    if (clickedNodeId) {
      dragNodeId.current = clickedNodeId;
      nodesRef.current[clickedNodeId].isDragging = true;
      if (selectedNodeId === clickedNodeId) {
        setSelectedNodeId(null);
      } else {
        setSelectedNodeId(clickedNodeId);
      }
    } else {
      setSelectedNodeId(null);
      isDraggingViewport.current = true;
      dragStart.current = { x: coords.x - transformRef.current.x, y: coords.y - transformRef.current.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const coords = getCanvasMouseCoords(e);
    const graphCoords = screenToGraphCoords(coords.x, coords.y);
    setMousePos(coords);

    if (dragNodeId.current) {
      const node = nodesRef.current[dragNodeId.current];
      if (node) {
        node.x = graphCoords.x;
        node.y = graphCoords.y;
        node.vx = 0;
        node.vy = 0;
      }
    } else if (isDraggingViewport.current) {
      setTransform((prev) => ({
        ...prev,
        x: coords.x - dragStart.current.x,
        y: coords.y - dragStart.current.y,
      }));
    } else {
      let hoveredId: string | null = null;
      const nodes = Object.values(nodesRef.current) as PhysicsNode[];
      for (const node of nodes) {
        const dx = graphCoords.x - node.x;
        const dy = graphCoords.y - node.y;
        if (dx * dx + dy * dy <= node.radius * node.radius) {
          hoveredId = node.id;
          break;
        }
      }
      setHoveredNodeId(hoveredId);
    }
  };

  const handleMouseUp = () => {
    if (dragNodeId.current) {
      const node = nodesRef.current[dragNodeId.current];
      if (node) {
        node.isDragging = false;
      }
      dragNodeId.current = null;
    }
    isDraggingViewport.current = false;
  };

  const handleMouseLeave = () => {
    handleMouseUp();
    setHoveredNodeId(null);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomIntensity = 0.05;
    const zoomFactor = e.deltaY < 0 ? 1 + zoomIntensity : 1 - zoomIntensity;
    const currentScale = transformRef.current.scale;
    const nextScale = Math.max(0.15, Math.min(4.0, currentScale * zoomFactor));

    const nextX = mouseX - (mouseX - transformRef.current.x) * (nextScale / currentScale);
    const nextY = mouseY - (mouseY - transformRef.current.y) * (nextScale / currentScale);

    setTransform({
      x: nextX,
      y: nextY,
      scale: nextScale,
    });
  };

  const zoomIn = () => {
    setTransform((prev) => ({
      ...prev,
      scale: Math.min(4.0, prev.scale + 0.15),
    }));
  };

  const zoomOut = () => {
    setTransform((prev) => ({
      ...prev,
      scale: Math.max(0.15, prev.scale - 0.15),
    }));
  };

  const resetTransform = () => {
    setTransform({ x: 0, y: 0, scale: 0.95 });
  };

  const handleDoubleClick = () => {
    if (selectedNodeId) {
      selectAndCenterNode(selectedNodeId);
    } else {
      resetTransform();
    }
  };

  const selectedNodeMetadata = useMemo(() => {
    if (!selectedNodeId) return null;
    return graphData.nodesMap[selectedNodeId] || null;
  }, [selectedNodeId, graphData]);

  const selectAndCenterNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    const node = nodesRef.current[nodeId];
    const canvas = canvasRef.current;
    if (node && canvas) {
      const cx = canvas.clientWidth / 2;
      const cy = canvas.clientHeight / 2;
      setTransform({
        x: cx - node.x * 1.5,
        y: cy - node.y * 1.5,
        scale: 1.5,
      });
    }
  };

  const topReferences = useMemo(() => {
    const counts: { [id: string]: number } = {};
    const nodes = graphData.nodesMap as Record<string, any>;
    Object.keys(nodes).forEach((id) => {
      counts[id] = 0;
    });

    graphData.edges.forEach((edge) => {
      if (counts[edge.target] !== undefined) {
        counts[edge.target]++;
      }
    });

    return Object.entries(counts)
      .map(([id, count]) => ({
        id,
        count,
        node: nodes[id],
      }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }, [graphData]);

  const bibliographyKeywords = useMemo(() => {
    const stopwords = new Set([
      "the", "of", "and", "a", "in", "to", "for", "on", "with", "as", "by", "an", "at", "from",
      "is", "that", "using", "based", "learning", "networks", "neural", "deep", "model", "models",
      "approach", "framework", "analysis", "system", "performance", "towards", "large", "language",
      "generation", "study", "design", "evaluation", "method", "methods"
    ]);
    const wordCounts: { [word: string]: number } = {};
    const nodes = Object.values(graphData.nodesMap) as any[];

    nodes.forEach((node) => {
      if (node && node.title) {
        const words = node.title
          .toLowerCase()
          .split(/[^a-z0-9]/)
          .filter((w: string) => w.length > 3 && !stopwords.has(w));
        
        const uniqueWords = Array.from(new Set(words));
        uniqueWords.forEach((w: string) => {
          wordCounts[w] = (wordCounts[w] || 0) + 1;
        });
      }
    });

    return Object.entries(wordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([word, count]) => ({ word, count }));
  }, [graphData]);

  return (
    <div id="sec-graph" className="bg-white/55 backdrop-blur-md border border-white/90 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
      <div className="flex items-center justify-between pb-2 border-b border-black/5">
        <div className="flex items-center gap-2">
          <Network className="w-4 h-4 text-[#6C5CE7]" />
          <h2 className="text-[12.5px] uppercase tracking-[0.09em] font-bold text-[#5B5570]">
            Citation Network
          </h2>
          {graphData.edges.length > 0 && (
            <span className="text-[9.5px] font-bold text-[#2F7D74] bg-[#DCEEEA] px-2 py-0.5 rounded-md uppercase tracking-wider font-mono">
              {graphData.edges.length} nodes
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 absolute left-2 text-[#8B85A0] pointer-events-none" />
            <input
              type="text"
              placeholder="Search graph..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-[10px] pl-7 pr-6 py-1.5 bg-black/[0.03] border border-black/5 rounded-lg w-28 sm:w-40 focus:outline-none focus:border-[#6C5CE7]/30 transition-all font-semibold text-[#241F33]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-1.5 text-black/30 hover:text-black cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <button
            onClick={() => setIsOpen(!isOpen)}
            className="text-[10px] font-bold text-[#8B85A0] hover:text-[#6C5CE7] transition-all uppercase tracking-wider cursor-pointer"
          >
            {isOpen ? "[ Collapse ]" : "[ Expand ]"}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="flex flex-col md:flex-row gap-4 h-[390px]">
          {/* Left Canvas Panel Container */}
          <div
            ref={containerRef}
            className="flex-1 relative border border-black/5 rounded-2xl overflow-hidden bg-white/40"
          >
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
              onWheel={handleWheel}
              onDoubleClick={handleDoubleClick}
              className="w-full h-full cursor-grab active:cursor-grabbing block"
            />

            {/* Float HUD Controls */}
            <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm border border-black/5 p-1 rounded-lg flex items-center gap-1 shadow-sm z-20">
              <button
                onClick={zoomIn}
                className="p-1 hover:bg-[#6C5CE7]/5 rounded text-black/60 hover:text-[#6C5CE7] cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={zoomOut}
                className="p-1 hover:bg-[#6C5CE7]/5 rounded text-black/60 hover:text-[#6C5CE7] cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={resetTransform}
                className="p-1 hover:bg-[#6C5CE7]/5 rounded text-black/60 hover:text-[#6C5CE7] cursor-pointer"
                title="Reset View"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <div className="w-px h-3.5 bg-black/5 mx-1" />
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className={`p-1 rounded cursor-pointer ${
                  isPlaying
                    ? "text-[#6C5CE7] hover:bg-[#6C5CE7]/10"
                    : "text-black/40 hover:bg-black/5"
                }`}
                title={isPlaying ? "Freeze Physics Layout" : "Enable Physics Layout"}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Hover Tooltip inside Canvas */}
            {hoveredNodeId && graphData.nodesMap[hoveredNodeId] && (
              <div
                style={tooltipStyle}
                className="pointer-events-none absolute bg-white/95 backdrop-blur-md text-[#241F33] p-3 rounded-xl max-w-[260px] shadow-xl border border-slate-100/80 z-30 transition-all duration-150 ease-out flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between gap-2 border-b border-slate-100/60 pb-1 mb-1">
                  <span
                    className={`text-[8px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full ${
                      graphData.nodesMap[hoveredNodeId].isIngested
                        ? "bg-[#6C5CE7]/10 text-[#6C5CE7]"
                        : "bg-blue-50 text-blue-600 border border-blue-100/50"
                    }`}
                  >
                    {graphData.nodesMap[hoveredNodeId].isIngested ? "Primary Document" : "Cited Reference"}
                  </span>
                  {graphData.nodesMap[hoveredNodeId].year && (
                    <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100/50">
                      {graphData.nodesMap[hoveredNodeId].year}
                    </span>
                  )}
                </div>

                <h4 className="font-serif font-bold text-[11px] text-slate-950 leading-snug line-clamp-3">
                  {graphData.nodesMap[hoveredNodeId].title}
                </h4>

                {graphData.nodesMap[hoveredNodeId].authors && (
                  <p className="text-[10px] text-slate-500 font-sans leading-normal">
                    <span className="font-semibold text-slate-600">Authors:</span>{" "}
                    <span className="italic">{graphData.nodesMap[hoveredNodeId].authors}</span>
                  </p>
                )}

                <div className="mt-1 pt-1 border-t border-slate-100/60 flex items-center gap-1 text-[8px] font-bold text-slate-400 uppercase tracking-wider">
                  <span className="text-[#6C5CE7]">●</span>
                  <span>Click to trace links</span>
                </div>
              </div>
            )}

            {/* Empty State Overlay */}
            {Object.keys(graphData.nodesMap).length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#F1EEF7]/30 backdrop-blur-xs p-4 text-center">
                <Network className="w-8 h-8 text-[#8B85A0]/50 mb-2 animate-pulse" />
                <p className="text-xs text-[#8B85A0] font-medium max-w-[280px] leading-relaxed">
                  No citation coordinates resolved yet. Click <strong>"Resolve Citations"</strong> next to a source paper in the left sidebar to map dependencies.
                </p>
              </div>
            )}
          </div>

          {/* Right Selected Inspector panel */}
          <div className="w-full md:w-56 shrink-0 flex flex-col border border-black/5 rounded-2xl bg-white/40 backdrop-blur-md p-3.5 shadow-sm max-h-[390px] overflow-y-auto">
            <h3 className="text-[9.5px] font-bold text-[#8B85A0] uppercase tracking-widest pb-1.5 border-b border-black/5 mb-2.5">
              Citation Inspector
            </h3>

            {selectedNodeMetadata ? (
              <div className="flex-1 flex flex-col gap-2.5 text-xs">
                <div>
                  <span
                    className={`text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${
                      selectedNodeMetadata.isIngested
                        ? "bg-[#6C5CE7]/15 text-[#6C5CE7]"
                        : "bg-[#4A90E2]/15 text-[#4A90E2]"
                    }`}
                  >
                    {selectedNodeMetadata.isIngested ? "Ingested Paper" : "External Cited"}
                  </span>
                  <h4 className="font-serif font-bold text-[#241F33] leading-snug mt-1.5 select-all">
                    {selectedNodeMetadata.title}
                  </h4>
                </div>

                <div className="flex flex-col gap-1 text-[11px] text-[#5B5570] leading-relaxed font-sans font-medium">
                  {selectedNodeMetadata.authors && (
                    <p>
                      <strong className="text-black/60">Authors:</strong> {selectedNodeMetadata.authors}
                    </p>
                  )}
                  {selectedNodeMetadata.year && (
                    <p>
                      <strong className="text-black/60">Year:</strong> {selectedNodeMetadata.year}
                    </p>
                  )}
                  {selectedNodeMetadata.citationObj?.venue && (
                    <p>
                      <strong className="text-black/60">Venue:</strong> {selectedNodeMetadata.citationObj.venue}
                    </p>
                  )}
                </div>

                {selectedNodeMetadata.citationObj?.abstract && (
                  <div className="flex-1 flex flex-col min-h-0 bg-white/80 rounded-xl p-2 border border-black/5">
                    <span className="text-[8px] font-bold text-[#8B85A0] uppercase tracking-wider mb-1 block font-mono">
                      Abstract Snapshot
                    </span>
                    <div className="overflow-y-auto max-h-[140px] pr-0.5 font-serif text-[10.5px] text-[#5B5570] leading-normal whitespace-pre-wrap select-text">
                      {selectedNodeMetadata.citationObj.abstract}
                    </div>
                  </div>
                )}

                {selectedNodeMetadata.isIngested ? (
                  <div className="flex flex-col gap-1.5 pt-1.5 border-t border-black/5">
                    <span className="text-[10px] text-[#2F7D74] font-bold flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Full layout vectorized</span>
                    </span>
                  </div>
                ) : (
                  selectedNodeMetadata.citationObj?.openAccessUrl && (
                    <div className="flex flex-col gap-1.5 pt-1.5 border-t border-black/5">
                      <a
                        href={selectedNodeMetadata.citationObj.openAccessUrl}
                        target="_blank"
                        referrerPolicy="no-referrer"
                        className="text-[10px] text-center font-bold text-white bg-[#4A90E2] hover:bg-[#4A90E2]/90 py-2 rounded-xl flex items-center justify-center gap-1 cursor-pointer transition-colors shadow-sm"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Download Open Access</span>
                      </a>
                    </div>
                  )
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-3.5 text-xs">
                {/* Micro metrics grid */}
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="bg-white/70 border border-black/[0.03] rounded-xl p-1.5 text-center shadow-sm">
                    <span className="text-[13px] font-extrabold text-[#6C5CE7] block leading-none">
                      {(Object.values(graphData.nodesMap) as any[]).filter((n) => n.isIngested).length}
                    </span>
                    <span className="text-[7.5px] font-bold text-[#8B85A0] uppercase tracking-wide font-mono block mt-1">
                      Ingested
                    </span>
                  </div>
                  <div className="bg-white/70 border border-black/[0.03] rounded-xl p-1.5 text-center shadow-sm">
                    <span className="text-[13px] font-extrabold text-[#0284C7] block leading-none">
                      {(Object.values(graphData.nodesMap) as any[]).filter((n) => !n.isIngested).length}
                    </span>
                    <span className="text-[7.5px] font-bold text-[#8B85A0] uppercase tracking-wide font-mono block mt-1">
                      Cited Refs
                    </span>
                  </div>
                </div>

                {/* Color Legend for Node Statuses */}
                <div className="flex flex-col gap-2 bg-white/70 border border-black/[0.03] rounded-xl p-2.5 shadow-sm">
                  <span className="text-[8px] font-bold text-[#8B85A0] uppercase tracking-wider font-mono block border-b border-black/5 pb-1">
                    Graph Color Key
                  </span>
                  <div className="flex flex-col gap-1.5 text-[10px] font-medium text-gray-600">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#6C5CE7] shrink-0 shadow-sm border border-[#5B4EC7]" />
                      <span className="truncate">Core Paper (Primary)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#D1FAE5] shrink-0 shadow-sm border border-[#059669]" />
                      <span className="truncate">Ingested elsewhere</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#E0F2FE] shrink-0 shadow-sm border border-[#0284C7]" />
                      <span className="truncate">Resolved (Abstract)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#FEF3C7] shrink-0 shadow-sm border border-[#D97706]" />
                      <span className="truncate">Pending Baseline</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#F1F5F9] shrink-0 shadow-sm border border-[#475569]" />
                      <span className="truncate">Unresolved / Failed</span>
                    </div>
                  </div>
                </div>

                {/* Key Research Keywords */}
                {bibliographyKeywords.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[8.5px] font-bold text-[#8B85A0] uppercase tracking-wider flex items-center gap-1 font-mono">
                      <Sparkles className="w-2.5 h-2.5 text-[#6C5CE7]" />
                      <span>Literature Themes</span>
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {bibliographyKeywords.map(({ word, count }) => (
                        <span
                          key={word}
                          className="text-[9px] font-semibold bg-[#6C5CE7]/5 text-[#6C5CE7] border border-[#6C5CE7]/10 px-2 py-0.5 rounded-full"
                          title={`Appears ${count} times in paper titles`}
                        >
                          {word}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Citation Hubs list */}
                <div className="flex flex-col gap-1.5 flex-1 min-h-0">
                  <span className="text-[8.5px] font-bold text-[#8B85A0] uppercase tracking-wider flex items-center gap-1 font-mono">
                    <Network className="w-2.5 h-2.5 text-[#4A90E2]" />
                    <span>Key Literature Hubs</span>
                  </span>
                  
                  {topReferences.length > 0 ? (
                    <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[170px] pr-0.5">
                      {topReferences.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => selectAndCenterNode(item.id)}
                          className="text-left w-full bg-white/60 hover:bg-[#6C5CE7]/5 border border-black/[0.04] hover:border-[#6C5CE7]/20 p-2 rounded-xl flex flex-col gap-0.5 transition-all group cursor-pointer"
                        >
                          <div className="flex items-start justify-between gap-1.5">
                            <span className="font-serif font-bold text-[10px] text-[#241F33] leading-snug line-clamp-2 group-hover:text-[#6C5CE7]">
                              {item.node.title}
                            </span>
                            <span className="shrink-0 text-[8px] font-bold bg-[#6C5CE7]/10 text-[#6C5CE7] px-1.5 py-0.5 rounded-md">
                              {item.count}×
                            </span>
                          </div>
                          {item.node.authors && (
                            <span className="text-[8.5px] text-[#8B85A0] truncate block font-sans">
                              {item.node.authors.split(",")[0]} {item.node.year ? `(${item.node.year})` : ""}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[9px] text-[#8B85A0] italic leading-snug">
                      No citation links resolved yet. Try resolving citations for your papers in the left sidebar.
                    </p>
                  )}
                </div>

                <div className="text-[8px] font-semibold text-[#8B85A0] border-t border-black/5 pt-1.5 flex items-center justify-between mt-auto font-mono">
                  <span>Interactive Map</span>
                  <span>Click node</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
