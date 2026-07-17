import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "docx";
import { Notebook, Report, ResolvedCitation, CitationFidelityResult } from "../types";

// -----------------------------------------------------------------------------
// Markdown Inline Formatting Parser
// -----------------------------------------------------------------------------
function parseInlineFormatting(text: string, isQuote = false): TextRun[] {
  // Strip out markdown links, replacing them with their readable text
  let cleanedText = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
  
  const runs: TextRun[] = [];
  let i = 0;
  let currentText = "";
  let bold = false;
  let italic = false;
  let code = false;

  const pushRun = () => {
    if (currentText) {
      runs.push(
        new TextRun({
          text: currentText,
          bold: bold,
          italics: italic || isQuote,
          font: code ? "Consolas" : "Inter",
          color: isQuote ? "4A455A" : undefined,
          size: isQuote ? 21 : 22, // 10.5pt or 11pt
        })
      );
      currentText = "";
    }
  };

  while (i < cleanedText.length) {
    if (cleanedText.startsWith("**", i) || cleanedText.startsWith("__", i)) {
      pushRun();
      bold = !bold;
      i += 2;
    } else if (cleanedText.startsWith("*", i) || cleanedText.startsWith("_", i)) {
      pushRun();
      italic = !italic;
      i += 1;
    } else if (cleanedText[i] === "`") {
      pushRun();
      code = !code;
      i += 1;
    } else {
      currentText += cleanedText[i];
      i += 1;
    }
  }
  pushRun();
  return runs;
}

// -----------------------------------------------------------------------------
// Full Markdown-to-Docx Element Parser
// -----------------------------------------------------------------------------
function parseMarkdownToDocx(markdown: string): any[] {
  const elements: any[] = [];
  const lines = markdown.split(/\r?\n/);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    if (!line) {
      i++;
      continue;
    }

    // Heading 1
    if (line.startsWith("# ")) {
      elements.push(
        new Paragraph({
          children: [
            new TextRun({
              text: line.substring(2),
              bold: true,
              font: "Inter",
              color: "1A1528",
              size: 32, // 16pt
            }),
          ],
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 240, after: 120 },
          keepNext: true,
        })
      );
      i++;
      continue;
    }

    // Heading 2
    if (line.startsWith("## ")) {
      elements.push(
        new Paragraph({
          children: [
            new TextRun({
              text: line.substring(3),
              bold: true,
              font: "Inter",
              color: "2D2544",
              size: 28, // 14pt
            }),
          ],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
          keepNext: true,
        })
      );
      i++;
      continue;
    }

    // Heading 3
    if (line.startsWith("### ")) {
      elements.push(
        new Paragraph({
          children: [
            new TextRun({
              text: line.substring(4),
              bold: true,
              font: "Inter",
              color: "4D3E72",
              size: 24, // 12pt
            }),
          ],
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 160, after: 80 },
          keepNext: true,
        })
      );
      i++;
      continue;
    }

    // Heading 4
    if (line.startsWith("#### ")) {
      elements.push(
        new Paragraph({
          children: [
            new TextRun({
              text: line.substring(5),
              bold: true,
              font: "Inter",
              color: "6C5CE7",
              size: 20, // 10pt
            }),
          ],
          heading: HeadingLevel.HEADING_4,
          spacing: { before: 120, after: 60 },
          keepNext: true,
        })
      );
      i++;
      continue;
    }

    // Blockquotes (Direct paper quotes or citation quotes)
    if (line.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        let quoteLine = lines[i].trim();
        quoteLine = quoteLine.substring(1).trim();
        quoteLines.push(quoteLine);
        i++;
      }

      const quoteText = quoteLines.join(" ");
      elements.push(
        new Paragraph({
          children: parseInlineFormatting(quoteText, true),
          spacing: { before: 140, after: 140 },
          indent: { left: 720 }, // 0.5 inches indentation
          border: {
            left: {
              color: "6C5CE7",
              size: 24, // 3pt border
              style: BorderStyle.SINGLE,
              space: 12,
            },
          },
        })
      );
      continue;
    }

    // Native Tables
    if (line.startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }

      // Filter out markdown spacer rows like |---|---|
      const cleanTableLines = tableLines.filter(
        (tl) => !/^[|:\s-]+$/.test(tl.replace(/\|/g, ""))
      );

      if (cleanTableLines.length > 0) {
        const tableRows = cleanTableLines.map((tl, rowIndex) => {
          const cols = tl.split("|").map((c) => c.trim());
          if (cols[0] === "") cols.shift();
          if (cols[cols.length - 1] === "") cols.pop();

          const isHeader = rowIndex === 0;

          return new TableRow({
            children: cols.map((cellText) => {
              return new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: cellText,
                        bold: isHeader,
                        font: "Inter",
                        color: isHeader ? "0F172A" : "334155",
                        size: isHeader ? 22 : 20,
                      }),
                    ],
                    spacing: { before: 100, after: 100 },
                  }),
                ],
                shading: isHeader
                  ? { fill: "F1F5F9" }
                  : rowIndex % 2 === 0
                  ? { fill: "F8FAFC" }
                  : undefined,
              });
            }),
          });
        });

        elements.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
              bottom: { style: BorderStyle.SINGLE, size: 8, color: "CBD5E1" },
              left: { style: BorderStyle.NIL },
              right: { style: BorderStyle.NIL },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "F1F5F9" },
              insideVertical: { style: BorderStyle.NIL },
            },
            rows: tableRows,
          })
        );

        elements.push(new Paragraph({ spacing: { after: 120 } }));
      }
      continue;
    }

    // Bullet List Items
    const bulletMatch = line.match(/^[-*+]\s+(.*)/);
    if (bulletMatch) {
      elements.push(
        new Paragraph({
          children: parseInlineFormatting(bulletMatch[1]),
          bullet: { level: 0 },
          spacing: { before: 40, after: 40 },
        })
      );
      i++;
      continue;
    }

    // Numbered List Items
    const numMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      elements.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${numMatch[1]}.  `, bold: true, font: "Inter" }),
            ...parseInlineFormatting(numMatch[2]),
          ],
          indent: { left: 360 },
          spacing: { before: 40, after: 40 },
        })
      );
      i++;
      continue;
    }

    // Standard Paragraph with Inline Formatting
    elements.push(
      new Paragraph({
        children: parseInlineFormatting(line),
        spacing: { before: 80, after: 120 },
      })
    );
    i++;
  }

  return elements;
}

// Helper to trigger browser download
function saveDocxFile(doc: Document, filename: string) {
  Packer.toBlob(doc).then((blob) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  });
}

// -----------------------------------------------------------------------------
// Export 1: Reports and Literature Reviews (with clean references)
// -----------------------------------------------------------------------------
export function exportReportToDocx(report: Report) {
  const fileTitle = report.title || "Research Flow Synthesis Report";
  
  // Strip out any manual Markdown reference headings from report content to avoid duplication
  let content = report.content;
  const referencesHeadings = ["## References", "### References", "# References"];
  for (const h of referencesHeadings) {
    if (content.includes(h)) {
      content = content.split(h)[0].trim();
    }
  }

  const documentChildren: any[] = [
    // Header Panel
    new Paragraph({
      children: [
        new TextRun({
          text: fileTitle,
          bold: true,
          font: "Inter",
          color: "6C5CE7",
          size: 44, // 22pt
        }),
      ],
      spacing: { before: 100, after: 60 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated Literature Synthesis • ${new Date(report.createdAt).toLocaleDateString()}`,
          font: "Inter",
          color: "6B7280",
          size: 20, // 10pt
        }),
      ],
      spacing: { after: 240 },
    }),

    // Horizontal Rule
    new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 8, color: "E2E8F0" },
      },
      spacing: { after: 300 },
    }),

    // Parsed Main Content
    ...parseMarkdownToDocx(content),
  ];

  // If there are structured references, append them elegantly at the end
  if (report.references && report.references.length > 0) {
    documentChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "References",
            bold: true,
            font: "Inter",
            color: "1A1528",
            size: 28, // 14pt
          }),
        ],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 360, after: 120 },
        keepNext: true,
      })
    );

    report.references.forEach((ref) => {
      const citationKey = ref.citationKey || "Ref";
      const status = ref.fidelity || "Unverifiable";
      const isRetracted = ref.retracted;

      const refRuns: TextRun[] = [
        new TextRun({
          text: `[${citationKey}] `,
          bold: true,
          font: "Inter",
          color: "6C5CE7",
        }),
        new TextRun({
          text: `${ref.title}. `,
          bold: true,
          font: "Inter",
        }),
        new TextRun({
          text: `${ref.authors}`,
          font: "Inter",
        }),
      ];

      if (ref.year) {
        refRuns.push(
          new TextRun({
            text: ` (${ref.year}).`,
            font: "Inter",
          })
        );
      }

      documentChildren.push(
        new Paragraph({
          children: refRuns,
          spacing: { before: 120, after: 40 },
        })
      );

      // Warning Box for Retracted Papers
      if (isRetracted) {
        documentChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: "⚠️ RETRACTED PAPER ALERT: This reference was marked as retracted by its publisher (verified via Crossref). Use with extreme caution.",
                bold: true,
                color: "DC2626", // Deep Red
                size: 19,
              }),
            ],
            spacing: { before: 40, after: 40 },
            indent: { left: 360 },
          })
        );
      }

      // Fidelity Warning/Success block
      const isSupported = status === "Supported";
      const hasDivergence = ref.divergence_type && ref.divergence_type !== "other";
      
      let fidelityLabel = `Fidelity Status: ${status}`;
      if (!isSupported && ref.divergence_type) {
        fidelityLabel += ` — ${ref.divergence_type.replace(/_/g, " ")}`;
      }

      const fidelityRuns = [
        new TextRun({
          text: `${fidelityLabel} • `,
          bold: true,
          color: isSupported ? "059669" : status === "Unsupported" ? "DC2626" : "D97706",
          size: 19, // 9.5pt
        }),
        new TextRun({
          text: `"${ref.fidelityJustification || "No validation log provided."}"`,
          italics: true,
          color: "4B5563",
          size: 19,
        }),
      ];

      documentChildren.push(
        new Paragraph({
          children: fidelityRuns,
          spacing: { before: 40, after: 80 },
          indent: { left: 360 },
        })
      );

      // Divergence details
      if (ref.divergence_description) {
        documentChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `↳ Divergence explanation: ${ref.divergence_description}`,
                font: "Inter",
                color: "7C3AED",
                size: 19,
              }),
            ],
            spacing: { before: 20, after: 80 },
            indent: { left: 480 },
          })
        );
      }
    });
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: documentChildren,
      },
    ],
  });

  const cleanFilename = fileTitle.toLowerCase().replace(/[^a-z0-9]+/g, "_") + ".docx";
  saveDocxFile(doc, cleanFilename);
}

// -----------------------------------------------------------------------------
// Export 2: Notebooks (Detailed Papers List, Citation Map, & Fidelity Audits)
// -----------------------------------------------------------------------------
export function exportNotebookToDocx(notebook: Notebook) {
  const documentChildren: any[] = [
    // Header Panel
    new Paragraph({
      children: [
        new TextRun({
          text: `Research Notebook: ${notebook.name}`,
          bold: true,
          font: "Inter",
          color: "6C5CE7",
          size: 44, // 22pt
        }),
      ],
      spacing: { before: 100, after: 60 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated Research Portfolio • ${new Date().toLocaleDateString()} • ${notebook.papers.length} Source Papers`,
          font: "Inter",
          color: "6B7280",
          size: 20, // 10pt
        }),
      ],
      spacing: { after: 240 },
    }),

    // Horizontal Rule
    new Paragraph({
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 8, color: "E2E8F0" },
      },
      spacing: { after: 300 },
    }),

    // Ingested Papers Section
    new Paragraph({
      children: [
        new TextRun({
          text: "1. Ingested Source Papers",
          bold: true,
          font: "Inter",
          color: "1A1528",
          size: 32, // 16pt
        }),
      ],
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 },
      keepNext: true,
    }),
  ];

  if (notebook.papers.length === 0) {
    documentChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "No papers have been uploaded to this notebook yet.",
            italics: true,
            color: "6B7280",
          }),
        ],
        spacing: { before: 100, after: 100 },
      })
    );
  } else {
    notebook.papers.forEach((paper, pIdx) => {
      documentChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${pIdx + 1}. ${paper.title}`,
              bold: true,
              font: "Inter",
              color: "2D2544",
              size: 24, // 12pt
            }),
          ],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 160, after: 60 },
          keepNext: true,
        })
      );

      documentChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `File: ${paper.filename}  •  Pages: ${paper.totalPages}  •  DOI: ${paper.doi || "N/A"}  •  Uploaded: ${new Date(paper.uploadedAt).toLocaleDateString()}`,
              font: "Consolas",
              color: "6B7280",
              size: 19, // 9.5pt
            }),
          ],
          spacing: { after: 120 },
        })
      );

      // List Citations for this paper
      if (paper.citations && paper.citations.length > 0) {
        documentChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: "Resolved Bibliography Citations:",
                bold: true,
                font: "Inter",
                color: "4D3E72",
                size: 20,
              }),
            ],
            spacing: { before: 60, after: 60 },
            indent: { left: 180 },
          })
        );

        paper.citations.forEach((cit) => {
          const isRetracted = cit.retracted;
          const bulletRuns = [
            new TextRun({
              text: `[${cit.citationKey || "Ref"}] `,
              bold: true,
              color: "6C5CE7",
            }),
            new TextRun({
              text: `${cit.title} `,
              bold: true,
            }),
            new TextRun({
              text: `by ${cit.authors || "Unknown Authors"}`,
            }),
          ];

          if (cit.year) {
            bulletRuns.push(new TextRun({ text: ` (${cit.year})` }));
          }

          if (cit.ingested) {
            bulletRuns.push(
              new TextRun({
                text: " [Full Text Ingested]",
                color: "10B981",
                bold: true,
              })
            );
          }

          documentChildren.push(
            new Paragraph({
              children: bulletRuns,
              bullet: { level: 1 },
              spacing: { before: 40, after: 40 },
              indent: { left: 360 },
            })
          );

          if (isRetracted) {
            documentChildren.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: "   ⚠️ RETRACTED: This paper is marked as retracted by Crossref.",
                    bold: true,
                    color: "DC2626",
                    size: 18,
                  }),
                ],
                spacing: { before: 20, after: 40 },
                indent: { left: 540 },
              })
            );
          }
        });
      } else {
        documentChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: "No citations resolved or bibliography found in this document.",
                italics: true,
                color: "9CA3AF",
                size: 20,
              }),
            ],
            spacing: { after: 100 },
            indent: { left: 180 },
          })
        );
      }
    });
  }

  // Fidelity Audit Results Section
  documentChildren.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "2. Citation Fidelity Verification Audit Logs",
          bold: true,
          font: "Inter",
          color: "1A1528",
          size: 32, // 16pt
        }),
      ],
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 280, after: 120 },
      keepNext: true,
    })
  );

  const fidelityList = notebook.fidelityResults || [];
  if (fidelityList.length === 0) {
    documentChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "No automated factual citation checks have been run yet. Use the 'Run Claims Check' option inside papers to run AI fidelity checks.",
            italics: true,
            color: "6B7280",
          }),
        ],
        spacing: { before: 100, after: 100 },
      })
    );
  } else {
    fidelityList.forEach((result, idx) => {
      const isSupported = result.status === "Supported";
      const isRetracted = result.retracted;

      documentChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Audit Result #${idx + 1}: ${result.citationMarker} — ${result.citedPaperTitle}`,
              bold: true,
              font: "Inter",
              color: "2D2544",
              size: 22, // 11pt
            }),
          ],
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 180, after: 60 },
          keepNext: true,
        })
      );

      // Source claim blockquote
      documentChildren.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Claim made in source paper:", bold: true, size: 19, color: "6B7280" })
          ],
          spacing: { before: 40, after: 20 },
          indent: { left: 180 },
        })
      );

      documentChildren.push(
        new Paragraph({
          children: parseInlineFormatting(result.claimInPaper, true),
          spacing: { before: 60, after: 60 },
          indent: { left: 360 },
          border: {
            left: {
              color: "CBD5E1",
              size: 16,
              style: BorderStyle.SINGLE,
              space: 8,
            },
          },
        })
      );

      // Retracted warning
      if (isRetracted) {
        documentChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: "⚠️ RETRACTED CITATION: This cited paper has been retracted according to Crossref metadata. Its claims are considered unreliable.",
                bold: true,
                color: "DC2626",
                size: 19,
              }),
            ],
            spacing: { before: 40, after: 40 },
            indent: { left: 180 },
          })
        );
      }

      // Status badge and justification
      let statusLabel = `Verification Status: ${result.status}`;
      if (!isSupported && result.divergence_type) {
        statusLabel += ` — ${result.divergence_type.replace(/_/g, " ")}`;
      }

      documentChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${statusLabel} • `,
              bold: true,
              color: isSupported ? "059669" : result.status === "Unsupported" ? "DC2626" : "D97706",
              size: 19,
            }),
            new TextRun({
              text: `"${result.justification}"`,
              italics: true,
              color: "4B5563",
              size: 19,
            }),
          ],
          spacing: { before: 40, after: 60 },
          indent: { left: 180 },
        })
      );

      // Divergence description
      if (result.divergence_description) {
        documentChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `↳ Divergence: ${result.divergence_description}`,
                font: "Inter",
                color: "7C3AED",
                size: 19,
              }),
            ],
            spacing: { before: 20, after: 120 },
            indent: { left: 240 },
          })
        );
      }
    });
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: documentChildren,
      },
    ],
  });

  const cleanFilename = notebook.name.toLowerCase().replace(/[^a-z0-9]+/g, "_") + "_portfolio.docx";
  saveDocxFile(doc, cleanFilename);
}
