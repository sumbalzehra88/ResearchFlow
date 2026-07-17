import React, { useState } from "react";
import { Info, ZoomIn, Layers, Cpu, Eye, ArrowRight } from "lucide-react";

interface Props {
  figureId: string;
  figureText: string;
  pageNumber: number;
}

export default function PaperDiagram({ figureId, figureText, pageNumber }: Props) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  // Detect which figure to render
  const isFigure1 = figureText.toLowerCase().includes("figure 1") || figureText.toLowerCase().includes("transformer - model architecture");
  const isFigure2 = figureText.toLowerCase().includes("figure 2") || figureText.toLowerCase().includes("attention") || figureText.toLowerCase().includes("dot-product");

  const getNodeTooltip = (nodeId: string): string => {
    switch (nodeId) {
      // Figure 1 (Transformer)
      case "input_emb":
        return "Input Embedding: Converts input tokens into high-dimensional vectors of size d_model (512).";
      case "pos_enc_enc":
        return "Positional Encoding (Encoder): Injects sine and cosine wave coordinates of different frequencies to give the model information about sequence order.";
      case "mha_enc":
        return "Multi-Head Attention (Encoder): Computes representation of input sequences by attending to different positions across 'h' (8) heads in parallel.";
      case "ffn_enc":
        return "Feed Forward Network (Encoder): Applies a position-wise fully connected network with ReLU activation to add non-linear representation capacity.";
      case "add_norm_1":
      case "add_norm_2":
      case "add_norm_3":
      case "add_norm_4":
      case "add_norm_5":
        return "Add & Norm: A residual skip connection followed by Layer Normalization. Helps gradient flow and accelerates training convergence.";
      case "output_emb":
        return "Output Embedding: Converts target tokens (shifted right) into d_model dimension vectors.";
      case "pos_enc_dec":
        return "Positional Encoding (Decoder): Injects sine/cosine sequence coordinates to represent positional ordering in target sequences.";
      case "masked_mha":
        return "Masked Multi-Head Attention: Prevents positions from attending to subsequent positions. Ensures output predictions depend only on known outputs.";
      case "mha_dec":
        return "Multi-Head Attention (Decoder): Attends to BOTH the encoder's output stack representations (keys/values) and the decoder's previous representations (queries).";
      case "ffn_dec":
        return "Feed Forward Network (Decoder): Position-wise fully connected feed-forward projection layers inside the decoder block.";
      case "linear_proj":
        return "Linear Projection: A standard fully connected layer that projects decoder outputs back to the vocabulary dimension.";
      case "softmax_prob":
        return "Softmax: Converts linear logits into actual output probabilities over the vocabulary of tokens.";

      // Figure 2 (Attention)
      case "matmul1":
        return "MatMul: Matrix multiplication between Query (Q) and transposed Key (K) to get raw attention logit scores.";
      case "scale":
        return "Scale: Divides dot products by sqrt(d_k) to prevent dot products from growing excessively large, avoiding vanishing gradients in softmax.";
      case "mask":
        return "Mask (Optional): Sets unwanted attention logits (future positions or padding) to negative infinity so they receive zero weight.";
      case "softmax":
        return "SoftMax: Applies softmax function over rows to normalize raw logit scores into valid attention probability weights.";
      case "matmul2":
        return "MatMul: Multiplies attention weight probabilities with Values (V) to get the weighted representation sum.";
      case "linear_qkv":
        return "Linear Layers (Q, K, V): Projections that map input vectors into lower-dimensional representation subspaces before computing attention.";
      case "sdpa_heads":
        return "Scaled Dot-Product Attention: Computes attention individually for each of the 'h' heads in parallel.";
      case "concat":
        return "Concat: Concatenates output vectors from all 'h' attention heads together.";
      case "linear_out":
        return "Linear Out: Projects concatenated head vectors back into the joint d_model embedding space.";
      default:
        return "Interactive component: Hover for architectural details and equations.";
    }
  };

  const renderFigure1 = () => {
    return (
      <div className="flex flex-col items-center gap-4 w-full select-none">
        <div className="text-center">
          <span className="text-[9px] font-bold text-[#6C5CE7] uppercase tracking-widest bg-[#6C5CE7]/10 px-2.5 py-1 rounded-full">
            Figure 1: Full Transformer Architecture
          </span>
          <p className="text-[10px] text-gray-500 mt-1 italic">Hover over blocks to inspect their roles & equations</p>
        </div>

        {/* Interactive Schematic Diagram */}
        <div className="relative w-full max-w-lg bg-slate-50/50 rounded-2xl border border-black/5 p-4 flex flex-col md:flex-row gap-6 justify-center items-center">
          {/* Tooltip detail bar */}
          {hoveredNode && (
            <div className="absolute top-2 left-2 right-2 bg-[#1A1A1A] text-white text-[10px] p-2.5 rounded-xl shadow-lg border border-white/10 z-20 flex items-start gap-2 animate-fade-in">
              <Info className="w-3.5 h-3.5 text-[#A29BFE] shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-[#DCD7FC] uppercase tracking-wider text-[8px] block">
                  Block Component Analysis
                </span>
                <p className="font-sans leading-tight mt-0.5">{getNodeTooltip(hoveredNode)}</p>
              </div>
            </div>
          )}

          {/* SVG Canvas for Model Architecture */}
          <svg viewBox="0 0 540 500" className="w-full h-auto max-h-[380px]">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 2 L 8 5 L 0 8 z" fill="#8B85A0" />
              </marker>
              <linearGradient id="primaryGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#8E2DE2" />
                <stop offset="100%" stopColor="#4A00E0" />
              </linearGradient>
              <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00c6ff" />
                <stop offset="100%" stopColor="#0072ff" />
              </linearGradient>
            </defs>

            {/* BACKGROUND RAIL LABELS */}
            <text x="70" y="25" fill="#8B85A0" fontSize="10" fontWeight="bold" fontFamily="monospace" letterSpacing="1">ENCODER (Nx = 6)</text>
            <text x="350" y="25" fill="#8B85A0" fontSize="10" fontWeight="bold" fontFamily="monospace" letterSpacing="1">DECODER (Nx = 6)</text>

            {/* Left and Right stack boxes */}
            <rect x="20" y="40" width="220" height="375" rx="16" fill="#F3F0FA" stroke="#DCD7FC" strokeWidth="1" strokeDasharray="4 4" />
            <rect x="290" y="40" width="230" height="375" rx="16" fill="#EFF5F9" stroke="#CFE1FD" strokeWidth="1" strokeDasharray="4 4" />

            {/* ================== ENCODER PATHWAY ================== */}
            {/* Input embedding */}
            <g
              onMouseEnter={() => setHoveredNode("input_emb")}
              onMouseLeave={() => setHoveredNode(null)}
              className="cursor-pointer transition-all hover:opacity-90"
            >
              <rect x="50" y="450" width="160" height="28" rx="8" fill="#FFFFFF" stroke="#8B85A0" strokeWidth="1" />
              <text x="130" y="467" fill="#241F33" fontSize="10" fontWeight="bold" textAnchor="middle">Input Embedding (512)</text>
            </g>

            {/* Positional Encoding (Encoder) */}
            <g
              onMouseEnter={() => setHoveredNode("pos_enc_enc")}
              onMouseLeave={() => setHoveredNode(null)}
              className="cursor-pointer transition-all hover:opacity-90"
            >
              <circle cx="210" cy="425" r="14" fill="#6C5CE7" fillOpacity="0.1" stroke="#6C5CE7" strokeWidth="1.5" />
              <path d="M 201 425 Q 205 417 210 425 T 219 425" stroke="#6C5CE7" strokeWidth="1.5" fill="none" />
              <text x="210" y="445" fill="#6C5CE7" fontSize="8" fontWeight="bold" textAnchor="middle">PE</text>
            </g>

            <path d="M 130 450 L 130 415" stroke="#8B85A0" strokeWidth="1.5" markerEnd="url(#arrow)" />
            <path d="M 196 425 L 130 425" stroke="#8B85A0" strokeWidth="1.5" />

            {/* Add & Norm (MHA) */}
            <g
              onMouseEnter={() => setHoveredNode("add_norm_1")}
              onMouseLeave={() => setHoveredNode(null)}
              className="cursor-pointer transition-all hover:opacity-90"
            >
              <rect x="50" y="280" width="160" height="24" rx="6" fill="#6C5CE7" fillOpacity="0.1" stroke="#6C5CE7" strokeWidth="1.2" />
              <text x="130" y="295" fill="#6C5CE7" fontSize="9" fontWeight="bold" textAnchor="middle">Add & Norm (Residual)</text>
            </g>

            {/* Multi-Head Attention (Encoder) */}
            <g
              onMouseEnter={() => setHoveredNode("mha_enc")}
              onMouseLeave={() => setHoveredNode(null)}
              className="cursor-pointer transition-all hover:opacity-90"
            >
              <rect x="50" y="325" width="160" height="32" rx="8" fill="url(#primaryGrad)" stroke="none" />
              <text x="130" y="345" fill="#FFFFFF" fontSize="10" fontWeight="bold" textAnchor="middle">Multi-Head Attention</text>
            </g>

            <path d="M 130 415 L 130 357" stroke="#8B85A0" strokeWidth="1.5" markerEnd="url(#arrow)" />
            <path d="M 130 325 L 130 304" stroke="#8B85A0" strokeWidth="1.5" markerEnd="url(#arrow)" />

            {/* Skip connection around MHA */}
            <path d="M 130 415 L 35 415 L 35 292 L 50 292" stroke="#8B85A0" strokeWidth="1.2" strokeDasharray="3 3" markerEnd="url(#arrow)" />

            {/* Add & Norm (FFN) */}
            <g
              onMouseEnter={() => setHoveredNode("add_norm_2")}
              onMouseLeave={() => setHoveredNode(null)}
              className="cursor-pointer transition-all hover:opacity-90"
            >
              <rect x="50" y="120" width="160" height="24" rx="6" fill="#6C5CE7" fillOpacity="0.1" stroke="#6C5CE7" strokeWidth="1.2" />
              <text x="130" y="135" fill="#6C5CE7" fontSize="9" fontWeight="bold" textAnchor="middle">Add & Norm (Residual)</text>
            </g>

            {/* Feed Forward (Encoder) */}
            <g
              onMouseEnter={() => setHoveredNode("ffn_enc")}
              onMouseLeave={() => setHoveredNode(null)}
              className="cursor-pointer transition-all hover:opacity-90"
            >
              <rect x="50" y="165" width="160" height="32" rx="8" fill="#10B981" fillOpacity="0.9" stroke="none" />
              <text x="130" y="185" fill="#FFFFFF" fontSize="10" fontWeight="bold" textAnchor="middle">Feed Forward Network</text>
            </g>

            <path d="M 130 280 L 130 197" stroke="#8B85A0" strokeWidth="1.5" markerEnd="url(#arrow)" />
            <path d="M 130 165 L 130 144" stroke="#8B85A0" strokeWidth="1.5" markerEnd="url(#arrow)" />

            {/* Skip connection around FFN */}
            <path d="M 130 240 L 35 240 L 35 132 L 50 132" stroke="#8B85A0" strokeWidth="1.2" strokeDasharray="3 3" markerEnd="url(#arrow)" />


            {/* ================== DECODER PATHWAY ================== */}
            {/* Output Embedding */}
            <g
              onMouseEnter={() => setHoveredNode("output_emb")}
              onMouseLeave={() => setHoveredNode(null)}
              className="cursor-pointer transition-all hover:opacity-90"
            >
              <rect x="320" y="450" width="170" height="28" rx="8" fill="#FFFFFF" stroke="#8B85A0" strokeWidth="1" />
              <text x="405" y="467" fill="#241F33" fontSize="10" fontWeight="bold" textAnchor="middle">Outputs (shifted right)</text>
            </g>

            {/* Positional Encoding (Decoder) */}
            <g
              onMouseEnter={() => setHoveredNode("pos_enc_dec")}
              onMouseLeave={() => setHoveredNode(null)}
              className="cursor-pointer transition-all hover:opacity-90"
            >
              <circle cx="500" cy="425" r="14" fill="#0072ff" fillOpacity="0.1" stroke="#0072ff" strokeWidth="1.5" />
              <path d="M 491 425 Q 495 417 500 425 T 509 425" stroke="#0072ff" strokeWidth="1.5" fill="none" />
              <text x="500" y="445" fill="#0072ff" fontSize="8" fontWeight="bold" textAnchor="middle">PE</text>
            </g>

            <path d="M 405 450 L 405 415" stroke="#8B85A0" strokeWidth="1.5" markerEnd="url(#arrow)" />
            <path d="M 486 425 L 405 425" stroke="#8B85A0" strokeWidth="1.5" />

            {/* Masked MHA Add & Norm */}
            <g
              onMouseEnter={() => setHoveredNode("add_norm_3")}
              onMouseLeave={() => setHoveredNode(null)}
              className="cursor-pointer transition-all hover:opacity-90"
            >
              <rect x="320" y="280" width="170" height="24" rx="6" fill="#0072ff" fillOpacity="0.1" stroke="#0072ff" strokeWidth="1.2" />
              <text x="405" y="295" fill="#0072ff" fontSize="9" fontWeight="bold" textAnchor="middle">Add & Norm (Residual)</text>
            </g>

            {/* Masked Multi-Head Attention */}
            <g
              onMouseEnter={() => setHoveredNode("masked_mha")}
              onMouseLeave={() => setHoveredNode(null)}
              className="cursor-pointer transition-all hover:opacity-90"
            >
              <rect x="320" y="325" width="170" height="32" rx="8" fill="url(#accentGrad)" stroke="none" />
              <text x="405" y="345" fill="#FFFFFF" fontSize="10" fontWeight="bold" textAnchor="middle">Masked Multi-Head Attn</text>
            </g>

            <path d="M 405 415 L 405 357" stroke="#8B85A0" strokeWidth="1.5" markerEnd="url(#arrow)" />
            <path d="M 405 325 L 405 304" stroke="#8B85A0" strokeWidth="1.5" markerEnd="url(#arrow)" />

            {/* Skip connection around Masked MHA */}
            <path d="M 405 415 L 305 415 L 305 292 L 320 292" stroke="#8B85A0" strokeWidth="1.2" strokeDasharray="3 3" markerEnd="url(#arrow)" />

            {/* Cross Multi-Head Attention Add & Norm */}
            <g
              onMouseEnter={() => setHoveredNode("add_norm_4")}
              onMouseLeave={() => setHoveredNode(null)}
              className="cursor-pointer transition-all hover:opacity-90"
            >
              <rect x="320" y="195" width="170" height="24" rx="6" fill="#0072ff" fillOpacity="0.1" stroke="#0072ff" strokeWidth="1.2" />
              <text x="405" y="210" fill="#0072ff" fontSize="9" fontWeight="bold" textAnchor="middle">Add & Norm (Residual)</text>
            </g>

            {/* Cross Multi-Head Attention (Decoder MHA) */}
            <g
              onMouseEnter={() => setHoveredNode("mha_dec")}
              onMouseLeave={() => setHoveredNode(null)}
              className="cursor-pointer transition-all hover:opacity-90"
            >
              <rect x="320" y="240" width="170" height="32" rx="8" fill="url(#primaryGrad)" stroke="none" />
              <text x="405" y="260" fill="#FFFFFF" fontSize="10" fontWeight="bold" textAnchor="middle">Multi-Head Attention</text>
            </g>

            <path d="M 405 280 L 405 272" stroke="#8B85A0" strokeWidth="1.5" markerEnd="url(#arrow)" />
            <path d="M 405 240 L 405 219" stroke="#8B85A0" strokeWidth="1.5" markerEnd="url(#arrow)" />

            {/* Skip connection around Cross MHA */}
            <path d="M 405 280 L 305 280 L 305 207 L 320 207" stroke="#8B85A0" strokeWidth="1.2" strokeDasharray="3 3" markerEnd="url(#arrow)" />

            {/* Connection from Encoder Output to Decoder Cross MHA (Keys and Values) */}
            <path d="M 130 120 L 130 90 L 265 90 L 265 256 L 320 256" stroke="#EF4444" strokeWidth="1.5" strokeDasharray="4 2" markerEnd="url(#arrow)" />
            <text x="265" y="150" fill="#EF4444" fontSize="8" fontWeight="bold" textAnchor="middle" transform="rotate(-90,265,150)">Encoder Context (K,V)</text>

            {/* Decoder Feed Forward Add & Norm */}
            <g
              onMouseEnter={() => setHoveredNode("add_norm_5")}
              onMouseLeave={() => setHoveredNode(null)}
              className="cursor-pointer transition-all hover:opacity-90"
            >
              <rect x="320" y="110" width="170" height="24" rx="6" fill="#0072ff" fillOpacity="0.1" stroke="#0072ff" strokeWidth="1.2" />
              <text x="405" y="125" fill="#0072ff" fontSize="9" fontWeight="bold" textAnchor="middle">Add & Norm (Residual)</text>
            </g>

            {/* Decoder Feed Forward */}
            <g
              onMouseEnter={() => setHoveredNode("ffn_dec")}
              onMouseLeave={() => setHoveredNode(null)}
              className="cursor-pointer transition-all hover:opacity-90"
            >
              <rect x="320" y="150" width="170" height="32" rx="8" fill="#10B981" fillOpacity="0.9" stroke="none" />
              <text x="405" y="170" fill="#FFFFFF" fontSize="10" fontWeight="bold" textAnchor="middle">Feed Forward Network</text>
            </g>

            <path d="M 405 195 L 405 182" stroke="#8B85A0" strokeWidth="1.5" markerEnd="url(#arrow)" />
            <path d="M 405 150 L 405 134" stroke="#8B85A0" strokeWidth="1.5" markerEnd="url(#arrow)" />

            {/* Skip connection around Decoder FFN */}
            <path d="M 405 195 L 305 195 L 305 122 L 320 122" stroke="#8B85A0" strokeWidth="1.2" strokeDasharray="3 3" markerEnd="url(#arrow)" />


            {/* ================== MODEL OUTPUT STAGE ================== */}
            {/* Linear Layer */}
            <g
              onMouseEnter={() => setHoveredNode("linear_proj")}
              onMouseLeave={() => setHoveredNode(null)}
              className="cursor-pointer transition-all hover:opacity-90"
            >
              <rect x="320" y="60" width="170" height="24" rx="6" fill="#6B7280" stroke="none" />
              <text x="405" y="75" fill="#FFFFFF" fontSize="10" fontWeight="bold" textAnchor="middle">Linear Projection</text>
            </g>

            {/* Softmax probabilities */}
            <g
              onMouseEnter={() => setHoveredNode("softmax_prob")}
              onMouseLeave={() => setHoveredNode(null)}
              className="cursor-pointer transition-all hover:opacity-90"
            >
              <rect x="320" y="10" width="170" height="24" rx="6" fill="#F43F5E" stroke="none" />
              <text x="405" y="25" fill="#FFFFFF" fontSize="10" fontWeight="bold" textAnchor="middle">Softmax Logits</text>
            </g>

            <path d="M 405 110 L 405 84" stroke="#8B85A0" strokeWidth="1.5" markerEnd="url(#arrow)" />
            <path d="M 405 60 L 405 34" stroke="#8B85A0" strokeWidth="1.5" markerEnd="url(#arrow)" />
          </svg>
        </div>
      </div>
    );
  };

  const renderFigure2 = () => {
    return (
      <div className="flex flex-col items-center gap-4 w-full select-none">
        <div className="text-center">
          <span className="text-[9px] font-bold text-[#6C5CE7] uppercase tracking-widest bg-[#6C5CE7]/10 px-2.5 py-1 rounded-full">
            Figure 2: Attention Formulations
          </span>
          <p className="text-[10px] text-gray-500 mt-1 italic">Hover components for details on scaled scores and projection linearities</p>
        </div>

        {/* Dynamic Multi-diagram Layout */}
        <div className="relative w-full max-w-2xl bg-slate-50/50 rounded-2xl border border-black/5 p-4 flex flex-col md:flex-row gap-6 justify-center items-stretch">
          {hoveredNode && (
            <div className="absolute top-2 left-2 right-2 bg-[#1A1A1A] text-white text-[10px] p-2.5 rounded-xl shadow-lg border border-white/10 z-20 flex items-start gap-2 animate-fade-in">
              <Info className="w-3.5 h-3.5 text-[#A29BFE] shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-[#DCD7FC] uppercase tracking-wider text-[8px] block">
                  Interactive Mathematical Substructure
                </span>
                <p className="font-sans leading-tight mt-0.5">{getNodeTooltip(hoveredNode)}</p>
              </div>
            </div>
          )}

          {/* LEFT: Scaled Dot-Product Attention */}
          <div className="flex-1 border-b md:border-b-0 md:border-r border-black/5 pb-4 md:pb-0 md:pr-4 flex flex-col items-center">
            <span className="text-[9px] font-mono font-bold text-gray-400 mb-2">SCALED DOT-PRODUCT ATTENTION</span>
            <svg viewBox="0 0 240 380" className="w-full h-auto max-h-[300px]">
              <defs>
                <marker id="arrow-sdpa" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                  <path d="M 0 2 L 8 5 L 0 8 z" fill="#8B85A0" />
                </marker>
              </defs>

              {/* Inputs */}
              <text x="30" y="360" fill="#241F33" fontSize="10" fontWeight="bold" fontFamily="monospace">Q</text>
              <text x="120" y="360" fill="#241F33" fontSize="10" fontWeight="bold" fontFamily="monospace">K</text>
              <text x="210" y="360" fill="#241F33" fontSize="10" fontWeight="bold" fontFamily="monospace">V</text>

              {/* MatMul 1 */}
              <g
                onMouseEnter={() => setHoveredNode("matmul1")}
                onMouseLeave={() => setHoveredNode(null)}
                className="cursor-pointer transition-all hover:opacity-90"
              >
                <rect x="50" y="290" width="100" height="24" rx="6" fill="#8E2DE2" stroke="none" />
                <text x="100" y="305" fill="#FFFFFF" fontSize="9" fontWeight="bold" textAnchor="middle">MatMul (Q × K^T)</text>
              </g>

              <path d="M 38 348 L 70 314" stroke="#8B85A0" strokeWidth="1.2" markerEnd="url(#arrow-sdpa)" />
              <path d="M 120 348 L 110 314" stroke="#8B85A0" strokeWidth="1.2" markerEnd="url(#arrow-sdpa)" />

              {/* Scale */}
              <g
                onMouseEnter={() => setHoveredNode("scale")}
                onMouseLeave={() => setHoveredNode(null)}
                className="cursor-pointer transition-all hover:opacity-90"
              >
                <rect x="50" y="240" width="100" height="24" rx="6" fill="#4A00E0" stroke="none" />
                <text x="100" y="255" fill="#FFFFFF" fontSize="9" fontWeight="bold" textAnchor="middle">Scale (1 / √d_k)</text>
              </g>

              <path d="M 100 290 L 100 264" stroke="#8B85A0" strokeWidth="1.2" markerEnd="url(#arrow-sdpa)" />

              {/* Mask (optional) */}
              <g
                onMouseEnter={() => setHoveredNode("mask")}
                onMouseLeave={() => setHoveredNode(null)}
                className="cursor-pointer transition-all hover:opacity-90"
              >
                <rect x="50" y="190" width="100" height="24" rx="6" fill="#6B7280" stroke="none" />
                <text x="100" y="205" fill="#FFFFFF" fontSize="9" fontWeight="bold" textAnchor="middle">Mask (Optional)</text>
              </g>

              <path d="M 100 240 L 100 214" stroke="#8B85A0" strokeWidth="1.2" markerEnd="url(#arrow-sdpa)" />

              {/* Softmax */}
              <g
                onMouseEnter={() => setHoveredNode("softmax")}
                onMouseLeave={() => setHoveredNode(null)}
                className="cursor-pointer transition-all hover:opacity-90"
              >
                <rect x="50" y="140" width="100" height="24" rx="6" fill="#F43F5E" stroke="none" />
                <text x="100" y="155" fill="#FFFFFF" fontSize="9" fontWeight="bold" textAnchor="middle">Softmax (Weights)</text>
              </g>

              <path d="M 100 190 L 100 164" stroke="#8B85A0" strokeWidth="1.2" markerEnd="url(#arrow-sdpa)" />

              {/* MatMul 2 */}
              <g
                onMouseEnter={() => setHoveredNode("matmul2")}
                onMouseLeave={() => setHoveredNode(null)}
                className="cursor-pointer transition-all hover:opacity-90"
              >
                <rect x="50" y="80" width="140" height="28" rx="6" fill="#8E2DE2" stroke="none" />
                <text x="120" y="97" fill="#FFFFFF" fontSize="9" fontWeight="bold" textAnchor="middle">MatMul (Attn × V)</text>
              </g>

              <path d="M 100 140 L 110 108" stroke="#8B85A0" strokeWidth="1.2" markerEnd="url(#arrow-sdpa)" />
              <path d="M 210 348 L 210 180 L 150 108" stroke="#8B85A0" strokeWidth="1.2" markerEnd="url(#arrow-sdpa)" />

              {/* Output arrow */}
              <path d="M 120 80 L 120 45" stroke="#8B85A0" strokeWidth="1.5" markerEnd="url(#arrow-sdpa)" />
              <text x="120" y="35" fill="#241F33" fontSize="10" fontWeight="bold" textAnchor="middle">Output Vector</text>
            </svg>
          </div>

          {/* RIGHT: Multi-Head Attention */}
          <div className="flex-1 pt-4 md:pt-0 md:pl-4 flex flex-col items-center">
            <span className="text-[9px] font-mono font-bold text-gray-400 mb-2">MULTI-HEAD ATTENTION SYSTEM</span>
            <svg viewBox="0 0 240 380" className="w-full h-auto max-h-[300px]">
              <defs>
                <marker id="arrow-mha" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                  <path d="M 0 2 L 8 5 L 0 8 z" fill="#8B85A0" />
                </marker>
              </defs>

              {/* Inputs V, K, Q */}
              <text x="50" y="365" fill="#241F33" fontSize="10" fontWeight="bold" fontFamily="monospace" textAnchor="middle">V</text>
              <text x="120" y="365" fill="#241F33" fontSize="10" fontWeight="bold" fontFamily="monospace" textAnchor="middle">K</text>
              <text x="190" y="365" fill="#241F33" fontSize="10" fontWeight="bold" fontFamily="monospace" textAnchor="middle">Q</text>

              {/* Linear projections */}
              <g
                onMouseEnter={() => setHoveredNode("linear_qkv")}
                onMouseLeave={() => setHoveredNode(null)}
                className="cursor-pointer transition-all hover:opacity-90"
              >
                <rect x="25" y="295" width="50" height="20" rx="4" fill="#6C5CE7" fillOpacity="0.1" stroke="#6C5CE7" strokeWidth="1" />
                <text x="50" y="308" fill="#6C5CE7" fontSize="8" fontWeight="bold" textAnchor="middle">Linear</text>

                <rect x="95" y="295" width="50" height="20" rx="4" fill="#6C5CE7" fillOpacity="0.1" stroke="#6C5CE7" strokeWidth="1" />
                <text x="120" y="308" fill="#6C5CE7" fontSize="8" fontWeight="bold" textAnchor="middle">Linear</text>

                <rect x="165" y="295" width="50" height="20" rx="4" fill="#6C5CE7" fillOpacity="0.1" stroke="#6C5CE7" strokeWidth="1" />
                <text x="190" y="308" fill="#6C5CE7" fontSize="8" fontWeight="bold" textAnchor="middle">Linear</text>
              </g>

              <path d="M 50 350 L 50 315" stroke="#8B85A0" strokeWidth="1.2" markerEnd="url(#arrow-mha)" />
              <path d="M 120 350 L 120 315" stroke="#8B85A0" strokeWidth="1.2" markerEnd="url(#arrow-mha)" />
              <path d="M 190 350 L 190 315" stroke="#8B85A0" strokeWidth="1.2" markerEnd="url(#arrow-mha)" />

              {/* Scaled Dot-Product Attention Blocks (representing h stacked heads) */}
              <g
                onMouseEnter={() => setHoveredNode("sdpa_heads")}
                onMouseLeave={() => setHoveredNode(null)}
                className="cursor-pointer transition-all hover:opacity-90"
              >
                {/* Stack background indicators */}
                <rect x="52" y="197" width="140" height="34" rx="6" fill="#F43F5E" fillOpacity="0.3" stroke="none" />
                <rect x="47" y="202" width="140" height="34" rx="6" fill="#4A00E0" fillOpacity="0.4" stroke="none" />
                {/* Main front head */}
                <rect x="40" y="207" width="140" height="34" rx="6" fill="url(#primaryGrad)" stroke="none" />
                <text x="110" y="228" fill="#FFFFFF" fontSize="9" fontWeight="bold" textAnchor="middle">Scaled Dot-Product Attention</text>
                <text x="196" y="215" fill="#8B85A0" fontSize="8" fontWeight="bold" fontFamily="monospace">h = 8</text>
              </g>

              <path d="M 50 295 L 50 241" stroke="#8B85A0" strokeWidth="1.2" markerEnd="url(#arrow-mha)" />
              <path d="M 120 295 L 120 241" stroke="#8B85A0" strokeWidth="1.2" markerEnd="url(#arrow-mha)" />
              <path d="M 190 295 L 190 241" stroke="#8B85A0" strokeWidth="1.2" markerEnd="url(#arrow-mha)" />

              {/* Concat */}
              <g
                onMouseEnter={() => setHoveredNode("concat")}
                onMouseLeave={() => setHoveredNode(null)}
                className="cursor-pointer transition-all hover:opacity-90"
              >
                <rect x="40" y="140" width="140" height="22" rx="5" fill="#10B981" stroke="none" />
                <text x="110" y="154" fill="#FFFFFF" fontSize="9" fontWeight="bold" textAnchor="middle">Concat (Heads 1 ... h)</text>
              </g>

              <path d="M 110 207 L 110 162" stroke="#8B85A0" strokeWidth="1.2" markerEnd="url(#arrow-mha)" />

              {/* Linear Out */}
              <g
                onMouseEnter={() => setHoveredNode("linear_out")}
                onMouseLeave={() => setHoveredNode(null)}
                className="cursor-pointer transition-all hover:opacity-90"
              >
                <rect x="40" y="80" width="140" height="24" rx="5" fill="#6B7280" stroke="none" />
                <text x="110" y="95" fill="#FFFFFF" fontSize="9" fontWeight="bold" textAnchor="middle">Linear Projection</text>
              </g>

              <path d="M 110 140 L 110 104" stroke="#8B85A0" strokeWidth="1.2" markerEnd="url(#arrow-mha)" />

              {/* Final Output */}
              <path d="M 110 80 L 110 45" stroke="#8B85A0" strokeWidth="1.5" markerEnd="url(#arrow-mha)" />
              <text x="110" y="35" fill="#241F33" fontSize="10" fontWeight="bold" textAnchor="middle">Multi-Head Output</text>
            </svg>
          </div>
        </div>
      </div>
    );
  };

  const renderFallback = () => {
    return (
      <div className="flex flex-col items-center gap-3 w-full bg-slate-50/50 rounded-2xl border border-black/5 p-4 select-none">
        <div className="flex items-center gap-2 text-[#6C5CE7] bg-[#6C5CE7]/10 px-3 py-1.5 rounded-full">
          <Layers className="w-4 h-4" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Visual Schematic Ingestion Frame</span>
        </div>

        <div className="flex flex-col items-center py-6 text-center max-w-sm">
          <Cpu className="w-10 h-10 text-gray-300 animate-pulse mb-3" />
          <span className="text-xs font-bold text-gray-700">Multi-Modal Structural Representation</span>
          <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">
            This diagram describes the complex structure extracted from page {pageNumber}. Below is the detailed visual description of labels, axes, trends, and node components.
          </p>
        </div>
      </div>
    );
  };

  return (
    <div id={`diagram-${figureId}`} className="my-5 flex flex-col gap-4 w-full border border-black/10 rounded-2xl bg-white p-5 shadow-sm">
      {/* Dynamic Diagram Selector */}
      <div className="w-full flex justify-center">
        {isFigure1 ? renderFigure1() : isFigure2 ? renderFigure2() : renderFallback()}
      </div>

      {/* Structured Caption & In-Text Description */}
      <div className="border-t border-black/5 pt-3.5 mt-1.5">
        <div className="flex items-start gap-2 bg-[#F3F0FA]/40 p-3 rounded-xl border border-[#DCD7FC]/30">
          <Eye className="w-4 h-4 text-[#6C5CE7] shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="text-[10px] font-sans font-bold text-[#6C5CE7] uppercase tracking-wide block mb-1">
              Visual-Grounded Description (Page {pageNumber})
            </span>
            <p className="font-sans text-gray-600 text-xs leading-normal text-justify">
              {figureText}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
