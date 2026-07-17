import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertTriangle } from "lucide-react";
import katex from "katex";
import mermaid from "mermaid";

// Initialize mermaid for premium flowchart/diagram rendering
if (typeof window !== "undefined") {
  mermaid.initialize({
    startOnLoad: false,
    theme: "neutral",
    securityLevel: "loose",
    fontFamily: "Inter, sans-serif",
  });
}

interface MermaidProps {
  chart: string;
}

// Helper to sanitize and recover from common LLM Mermaid syntax errors (like unquoted parentheses in node labels)
function sanitizeMermaid(chartText: string): string {
  const clean = chartText
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

  const lines = clean.split("\n");
  const processedLines = lines.map((line) => {
    let trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("%%")) return line;

    // 1. Repair square brackets with parentheses/special characters: A[Text (with parens)] -> A["Text (with parens)"]
    trimmed = trimmed.replace(/([a-zA-Z0-9_-]+)\[(?!"| )([^\]"]+)\]/g, (match, id, content) => {
      return `${id}["${content.trim()}"]`;
    });

    // 2. Repair round brackets with parentheses/special characters: B(Text (with parens)) -> B["Text (with parens)"]
    trimmed = trimmed.replace(/([a-zA-Z0-9_-]+)\((?!"| )([^)]+)\)/g, (match, id, content) => {
      return `${id}["${content.trim()}"]`;
    });

    // 3. Repair subgraph names with parentheses or spaces that are not quoted: subgraph Encoder Stack (N = 6 Layers) -> subgraph "Encoder Stack (N = 6 Layers)"
    trimmed = trimmed.replace(/^subgraph\s+(?!"| )([^"\n]+)$/i, (match, title) => {
      if (title.includes(" ") || title.includes("(") || title.includes(")")) {
        // If there's an ID followed by space, e.g. "sub_id Title with spaces"
        const spaceIdx = title.indexOf(" ");
        if (spaceIdx !== -1) {
          const id = title.substring(0, spaceIdx);
          const rest = title.substring(spaceIdx + 1);
          return `subgraph ${id} ["${rest.trim()}"]`;
        }
        return `subgraph "${title.trim()}"`;
      }
      return match;
    });

    // Replace the original trimmed section with the repaired version
    return line.replace(line.trim(), trimmed);
  });

  return processedLines.join("\n");
}

export function MermaidDiagram({ chart }: MermaidProps) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!chart) return;

    let isMounted = true;
    const id = `mermaid-${Math.random().toString(36).substring(2, 9)}`;

    async function renderChart() {
      try {
        setError(null);
        // Clean chart text from extra HTML entities
        let cleanChart = chart
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&amp;/g, "&");
        
        let isValid = false;
        try {
          await mermaid.parse(cleanChart);
          isValid = true;
        } catch (e) {
          isValid = false;
        }

        if (!isValid) {
          // Attempt auto-recovery
          const sanitized = sanitizeMermaid(cleanChart);
          try {
            await mermaid.parse(sanitized);
            isValid = true;
            cleanChart = sanitized;
          } catch (e) {
            isValid = false;
          }
        }

        if (!isValid) {
          // Double-check if we can render directly anyways, or fallback to sanitized version
          cleanChart = sanitizeMermaid(cleanChart);
        }

        const { svg: renderedSvg } = await mermaid.render(id, cleanChart);
        if (isMounted) {
          setSvg(renderedSvg);
        }
      } catch (err: any) {
        console.error("Mermaid parsing/rendering failed:", err);
        if (isMounted) {
          setError(err.message || "Failed to render diagram");
        }
      }
    }

    renderChart();

    return () => {
      isMounted = false;
    };
  }, [chart]);

  if (error) {
    return (
      <div className="bg-amber-50/50 border border-amber-200/50 rounded-xl p-3 my-4 font-sans text-xs">
        <p className="font-semibold text-amber-800 mb-1">Visual Diagram Source:</p>
        <pre className="bg-black/5 p-2 rounded text-[10px] font-mono text-gray-700 overflow-x-auto whitespace-pre-wrap">
          {chart}
        </pre>
      </div>
    );
  }

  return (
    <div className="my-5 flex flex-col items-center justify-center p-4 bg-white/45 border border-black/5 rounded-2xl shadow-sm overflow-x-auto max-w-full">
      {svg ? (
        <div 
          className="w-full flex justify-center mermaid-rendered" 
          dangerouslySetInnerHTML={{ __html: svg }} 
        />
      ) : (
        <div className="flex items-center gap-2 py-4 text-xs text-[#8B85A0] font-mono">
          <span className="w-1.5 h-1.5 bg-[#6C5CE7] rounded-full animate-ping"></span>
          <span>Generating visual chart...</span>
        </div>
      )}
    </div>
  );
}

// Safe Unicode-Base64 encoding
function safeBtoa(str: string): string {
  try {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => {
      return String.fromCharCode(parseInt(p1, 16));
    }));
  } catch (e) {
    return btoa(str);
  }
}

// Safe Unicode-Base64 decoding
function safeAtob(str: string): string {
  try {
    return decodeURIComponent(atob(str).split('').map((c) => {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
  } catch (e) {
    return atob(str);
  }
}

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

interface FormattedMarkdownProps {
  content: string;
  onCitationClick?: (num: number) => void;
  fidelityMap?: Record<number, { 
    status: string; 
    justification: string; 
    divergence_type?: string; 
    divergence_description?: string; 
    retracted?: boolean; 
  }>;
}

export default function FormattedMarkdown({
  content,
  onCitationClick,
  fidelityMap,
}: FormattedMarkdownProps) {
  // Preprocess custom tags, inline bracket formatting, and LaTeX math equations to markdown-safe formats
  const preprocessMarkdown = (text: string): string => {
    if (!text) return "";

    let processed = preprocessPlainMath(text);

    // 1. Convert <term definition="X">Y</term> to custom markdown links: [Y](term://X)
    processed = processed.replace(
      /<term definition="([^"]+)">([^<]+)<\/term>/g,
      (_, def, term) => {
        return `[${term}](/term?def=${encodeURIComponent(def)})`;
      }
    );

    // 2. Convert [Source #X] to custom citation links: [#X](citation://X)
    processed = processed.replace(/\[Source #(\d+)\]/g, (_, num) => {
      return `[#${num}](/citation?id=${num})`;
    });

    // 3. Convert [X] (like report citation keys) to custom citation links if not already wrapped
    // Look for bracketed numbers that are not immediately preceded by a close bracket/paren (meaning we already processed it)
    processed = processed.replace(/(?<!\]\()\[(\d+)\](?!\])/g, (_, num) => {
      return `[#${num}](/citation?id=${num})`;
    });

    // 4. Preprocess display math $$ ... $$
    processed = processed.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
      const encoded = safeBtoa(tex.trim());
      return `\n\n[Math Block](/mathblock?tex=${encoded})\n\n`;
    });

    // 5. Preprocess display math \[ ... \] (or double-escaped \\[ ... \\])
    processed = processed.replace(/(?:\\{1,2}\[)([\s\S]+?)(?:\\{1,2}\])/g, (_, tex) => {
      const encoded = safeBtoa(tex.trim());
      return `\n\n[Math Block](/mathblock?tex=${encoded})\n\n`;
    });

    // 6. Preprocess inline math $ ... $ (non-crossed newlines, separated correctly)
    processed = processed.replace(/(?<![\w$])\$([^$\n]+?)\$(?![\w$])/g, (_, tex) => {
      const encoded = safeBtoa(tex.trim());
      return `[Math](/mathinline?tex=${encoded})`;
    });

    // 7. Preprocess inline math \( ... \) (or double-escaped \\( ... \\))
    processed = processed.replace(/(?:\\{1,2}\()([\s\S]+?)(?:\\{1,2}\))/g, (_, tex) => {
      const encoded = safeBtoa(tex.trim());
      return `[Math](/mathinline?tex=${encoded})`;
    });

    return processed;
  };

  const processedContent = preprocessMarkdown(content);

  // Custom component overrides for beautiful Tailwind styling
  const customComponents: any = {
    // Style paragraphs
    p: ({ children }: any) => (
      <p className="font-serif text-[#1A1A1A] leading-relaxed text-xs md:text-sm mb-3.5 last:mb-0">
        {children}
      </p>
    ),
    // Style display headings with high contrast
    h1: ({ children }: any) => (
      <h1 className="font-sans font-bold text-gray-900 tracking-tight text-base md:text-lg border-b border-black/5 pb-1.5 mt-5 mb-3 first:mt-0">
        {children}
      </h1>
    ),
    h2: ({ children }: any) => (
      <h2 className="font-sans font-bold text-gray-900 tracking-tight text-sm md:text-base mt-4 mb-2">
        {children}
      </h2>
    ),
    h3: ({ children }: any) => (
      <h3 className="font-sans font-bold text-gray-800 tracking-tight text-xs md:text-sm mt-3 mb-1.5">
        {children}
      </h3>
    ),
    // Style lists
    ul: ({ children }: any) => (
      <ul className="list-disc pl-5 mb-3.5 flex flex-col gap-1 text-xs md:text-sm text-gray-800 font-sans">
        {children}
      </ul>
    ),
    ol: ({ children }: any) => (
      <ol className="list-decimal pl-5 mb-3.5 flex flex-col gap-1 text-xs md:text-sm text-gray-800 font-sans">
        {children}
      </ol>
    ),
    li: ({ children }: any) => (
      <li className="leading-relaxed">
        {children}
      </li>
    ),
    // Style bold and italics
    strong: ({ children }: any) => (
      <strong className="font-semibold text-gray-900">{children}</strong>
    ),
    em: ({ children }: any) => (
      <em className="italic text-gray-800">{children}</em>
    ),
    // Style tables beautifully (no raw markdown visible!)
    table: ({ children }: any) => (
      <div className="overflow-x-auto my-4 border border-black/5 rounded-xl shadow-sm bg-white/40 max-w-full">
        <table className="w-full border-collapse text-left text-xs font-sans">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }: any) => (
      <thead className="bg-black/[0.03] border-b border-black/5 uppercase tracking-wider text-[10px] font-bold text-black/50">
        {children}
      </thead>
    ),
    tbody: ({ children }: any) => (
      <tbody className="divide-y divide-black/5 text-gray-700">
        {children}
      </tbody>
    ),
    tr: ({ children }: any) => (
      <tr className="hover:bg-black/[0.01] transition-colors">{children}</tr>
    ),
    th: ({ children }: any) => (
      <th className="p-3 font-semibold text-black/70 font-sans border-r border-black/5 last:border-0">{children}</th>
    ),
    td: ({ children }: any) => (
      <td className="p-3 leading-normal border-r border-black/5 last:border-0 align-top">{children}</td>
    ),
    // Style blockquotes
    blockquote: ({ children }: any) => (
      <blockquote className="border-l-4 border-[#6C5CE7] bg-[#6C5CE7]/5 pl-4 py-1.5 my-4 italic text-gray-600 rounded-r-lg font-serif text-xs md:text-sm">
        {children}
      </blockquote>
    ),
    // Style code blocks and inline code
    code: ({ node, inline, className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || "");
      
      // If code block is of type 'mermaid', render high-fidelity diagram component
      if (!inline && match && match[1] === "mermaid") {
        return <MermaidDiagram chart={String(children).trim()} />;
      }

      return !inline && match ? (
        <pre className="bg-black/5 border border-black/[0.03] p-3 rounded-xl my-4 overflow-x-auto font-mono text-[11px] text-gray-800 leading-relaxed max-w-full">
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
      ) : (
        <code
          className="font-mono text-[11px] font-semibold bg-black/5 text-[#D23F57] px-1.5 py-0.5 rounded border border-black/[0.03] font-mono"
          {...props}
        >
          {children}
        </code>
      );
    },
    // Handle our custom link schemes for hover tooltips, citation badges, and mathematical equations
    a: ({ href, children }: any) => {
      // 1. Term Hover Tooltip
      if (href?.startsWith("/term?def=")) {
        const definition = decodeURIComponent(href.replace("/term?def=", ""));
        return (
          <span
            id={`term-${Math.random().toString(36).substring(2, 9)}`}
            className="relative group inline-block mx-0.5 underline decoration-dotted decoration-[#6C5CE7]/60 hover:text-[#6C5CE7] font-sans font-semibold cursor-help bg-[#F3F4FD] px-1 rounded transition-colors"
          >
            {children}
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-[#1A1A1A] text-white text-[10px] p-2 rounded shadow-lg w-44 z-50 font-sans font-normal leading-snug normal-case">
              {definition}
            </span>
          </span>
        );
      }

      // 2. Citation Badge
      if (href?.startsWith("/citation?id=")) {
        const numStr = href.replace("/citation?id=", "");
        const num = parseInt(numStr, 10);
        
        // Check if there is an associated fidelity warning
        const fidelityMatch = fidelityMap?.[num];
        const isShaky = fidelityMatch && fidelityMatch.status !== "Supported";

        return (
          <span className="inline-flex items-center gap-0.5 align-baseline select-none">
            <sup
              onClick={() => onCitationClick?.(num)}
              title={`Source #${num}`}
              className="inline-block px-1 rounded-full bg-[#6C5CE7]/15 text-[#6C5CE7] hover:bg-[#6C5CE7]/25 font-sans font-bold text-[9px] cursor-pointer transition-all leading-none align-super py-0.5"
            >
              {children}
            </sup>
            {fidelityMatch?.retracted && (
              <sup
                title="Crossref Alert: This paper is marked as Retracted."
                className="inline-flex items-center bg-red-100 text-red-700 border border-red-200 rounded px-1 text-[8px] font-extrabold font-sans cursor-help ml-0.5 py-0.5 animate-pulse"
              >
                ⚠️ Retracted
              </sup>
            )}
            {isShaky && (
              <sup
                title={`Fidelity Warning: ${fidelityMatch.status}${fidelityMatch.divergence_type ? ` — ${fidelityMatch.divergence_type.replace(/_/g, " ")}` : ""} - ${fidelityMatch.justification}`}
                className="inline-flex items-center bg-amber-50 text-amber-700 border border-amber-200/50 rounded px-1 text-[8px] font-bold font-sans cursor-help ml-0.5 py-0.5"
              >
                <AlertTriangle className="w-2.5 h-2.5 text-amber-600 mr-0.5" />
                <span>{fidelityMatch.status}{fidelityMatch.divergence_type ? ` — ${fidelityMatch.divergence_type.replace(/_/g, " ")}` : ""}</span>
              </sup>
            )}
          </span>
        );
      }

      // 3. Block Math Rendering using KaTeX (typeset mathematically)
      if (href?.startsWith("/mathblock?tex=")) {
        const base64 = href.replace("/mathblock?tex=", "");
        let tex = "";
        try {
          tex = safeAtob(base64);
        } catch (e) {
          tex = decodeURIComponent(base64);
        }
        try {
          const html = katex.renderToString(tex, { displayMode: true, throwOnError: false });
          return (
            <span 
              className="block my-4 overflow-x-auto text-center py-2 bg-slate-50/50 border border-slate-100 rounded-xl" 
              dangerouslySetInnerHTML={{ __html: html }} 
            />
          );
        } catch (err) {
          return <pre className="text-red-500 font-mono text-xs my-3">{tex}</pre>;
        }
      }

      // 4. Inline Math Rendering using KaTeX
      if (href?.startsWith("/mathinline?tex=")) {
        const base64 = href.replace("/mathinline?tex=", "");
        let tex = "";
        try {
          tex = safeAtob(base64);
        } catch (e) {
          tex = decodeURIComponent(base64);
        }
        try {
          const html = katex.renderToString(tex, { displayMode: false, throwOnError: false });
          return (
            <span 
              className="inline-block align-middle mx-1 font-semibold text-gray-800" 
              dangerouslySetInnerHTML={{ __html: html }} 
            />
          );
        } catch (err) {
          return <code className="text-red-500 font-mono text-xs">{tex}</code>;
        }
      }

      // Standard outer link
      return (
        <a
          href={href}
          target="_blank"
          referrerPolicy="no-referrer"
          className="text-[#4A90E2] hover:underline font-medium transition-all"
        >
          {children}
        </a>
      );
    },
  };

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={customComponents}
        urlTransform={(url) => url}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
