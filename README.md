# ResearchFlow

An interactive research environment and citation network builder for
academics, scientists, and analysts — built to map scientific literature,
cross-examine claims against their sources, and synthesize findings with
higher precision than reading a paper (or a citation list) alone allows.

Unlike a standard "chat with your PDF" tool, ResearchFlow treats a paper's
citations as first-class data: every reference is extracted and shown even
before it's resolved externally, every claim tied to a citation can be
checked against what its source actually says, and every generated report
traces back to something the system actually retrieved.

## Features

### Interactive 2D Citation Network Graph
Citations are mapped as a dynamic network rather than a flat bibliography.

- **Node color key:**
  - Purple gradient — Core papers (your uploaded/ingested focal literature)
  - Light blue — Resolved citations (external papers successfully retrieved)
  - Warm amber — Pending baseline (citations awaiting metadata retrieval)
  - Slate gray — Unresolved/failed (sparse info or rate-limited sources)
- **Author-year node labels** (e.g. `S23`, `W21`) instead of icons, for a
  clean, high-fidelity layout.
- **Interactive physics canvas** — nodes repel and pull dynamically,
  highlighting clusters and connections on click.
- Every citation in a paper is visible as soon as the paper is ingested —
  full-text resolution enriches a node, it doesn't gate its existence.

### Deep-Research Chat
An intelligent co-pilot for reviewing ingested literature and
cross-examining claims across papers.

- **Grounded answers** — every claim is backed by specific quotes and exact
  page references, not general model knowledge.
- **Inline source expansion** — expand and review the exact matching text
  and page number directly within the chat, without leaving the workspace.
- Chat can be scoped to a single paper or across every paper in a notebook.

### Systematic Paper & Review Panel
Manage multiple papers across distinct research notebooks.

- **Fidelity checking** — every claim attached to a citation is
  cross-referenced against the actual cited source and classified as:
  - **Supported**
  - **Partially Supported** — including a `divergence_type` explaining how
    it diverges (overgeneralization, scope drift, temporal drift, causal
    overreach, or other)
  - **Unsupported**
  - **Unverifiable** — used whenever the underlying source is abstract-only
    or unresolved, rather than forcing a confident label without enough
    evidence to back it
  - **Retracted** — a separate, overriding flag for any resolved citation
    whose source has since been retracted or formally corrected
- **Literature digests** — structured summaries and critical review reports
  generated from your ingested library, using selectable templates
  (Executive Summary, Literature Review, Methods Critique, Full Report with
  References), with every claim traceable to a retrieved source and a real
  references section.
- **Adjustable wording** — two independent controls applied to both chat
  and generated reports: structural complexity (plain vs. dense prose) and
  jargon handling (as-is / hover-defined / plain-language where precision
  allows).
- **Word (.docx) export** — notebooks, reports, and reviews can be
  downloaded as properly formatted Word documents: real headings and
  tables, quoted paper text visually distinguished from generated analysis,
  and a references section — never raw markdown symbols in the output.

## Design system

- **Palette:** a soft gradient background blending pale lavender, soft
  pink, and light blue, with a purple-to-blue gradient
  (`#6C5CE7` → `#4A90E2`) reserved for headlines, primary actions, and
  active states.
- **Typography:** a rounded sans-serif for all UI chrome; a serif typeface
  for any actual paper content (quotes, abstracts, citation text) — the
  contrast signals "the tool talking" vs. "the source material speaking."
- **Status colors** are intentionally kept separate between the citation
  graph (resolution status: purple/light-blue/amber/slate-gray) and
  fidelity badges (truthfulness status: green/amber/red/gray), so the two
  systems are never visually confused with each other.
- No emojis anywhere in the app; every status is shown as a text label,
  never color alone.

## Tech stack

- Built in Google AI Studio, using the Gemini API for generation, vision
  (figure/table/chart description), and grounded chat.
- Firebase for auth and data persistence (notebooks, papers, citation
  graphs, fidelity results).
- PyMuPDF-based ingestion pipeline: text/heading extraction via font-size
  heuristics, full-page rasterization + Gemini vision for figures, tables,
  and charts, and hybrid BM25 + dense retrieval over a shared Chroma vector
  store.
- Citation resolution via Semantic Scholar / OpenAlex, with Unpaywall as a
  fallback for open-access full text, and Crossref for retraction status.

## Known limitations

- Built and tuned for personal use — no multi-tenant billing, plan tiers,
  or per-user rate limiting.
- Deployed via AI Studio's Build/Cloud Run path, which carries no uptime
  SLA; treat it as a personal tool, not production infrastructure, and
  export/back up notebooks periodically.
- Extraction heuristics (heading detection, vision-based figure
  identification) are tuned against clean, single-column preprints (e.g.
  arXiv). Messier layouts — scanned PDFs, two-column IEEE formatting — may
  extract less cleanly.
- Fidelity checking is an LLM-assisted aid, not a ground-truth verifier;
  spot-check its judgments against papers you know well before fully
  trusting a label.

## Roadmap (not yet built)

- Citation-chain drift detection — tracking how a finding shifts across
  multiple citation hops (reuses existing hop-depth resolution
  infrastructure).
