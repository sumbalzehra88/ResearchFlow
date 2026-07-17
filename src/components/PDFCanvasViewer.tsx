import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, Download, Loader2, ExternalLink } from "lucide-react";

interface Props {
  paperId: string;
}

export default function PDFCanvasViewer({ paperId }: Props) {
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNum, setPageNum] = useState<number>(1);
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.2);
  const [isLibraryLoaded, setIsLibraryLoaded] = useState<boolean>(false);
  const [isLoadingDoc, setIsLoadingDoc] = useState<boolean>(false);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // 1. Dynamically load PDF.js from CDN
  useEffect(() => {
    const scriptId = "pdfjs-cdn-script";
    const existingScript = document.getElementById(scriptId);

    const initPdfJs = () => {
      const globalPdfJS = (window as any).pdfjsLib;
      if (globalPdfJS) {
        globalPdfJS.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js";
        setIsLibraryLoaded(true);
      }
    };

    if (existingScript) {
      if ((window as any).pdfjsLib) {
        initPdfJs();
      } else {
        existingScript.addEventListener("load", initPdfJs);
      }
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js";
    script.async = true;
    script.onload = initPdfJs;
    script.onerror = () => {
      setError("Failed to load PDF rendering library from CDN. Please check your internet connection.");
    };
    document.body.appendChild(script);
  }, []);

  // 2. Load the PDF document when paperId or library is ready
  useEffect(() => {
    if (!isLibraryLoaded || !paperId) return;

    let isCurrent = true;
    setIsLoadingDoc(true);
    setError(null);
    setPdfDoc(null);
    setPageNum(1);

    const pdfUrl = `/api/papers/${paperId}/pdf`;
    const globalPdfJS = (window as any).pdfjsLib;

    const loadingTask = globalPdfJS.getDocument({
      url: pdfUrl,
      withCredentials: true,
    });

    loadingTask.promise
      .then((loadedDoc: any) => {
        if (!isCurrent) return;
        setPdfDoc(loadedDoc);
        setNumPages(loadedDoc.numPages);
        setIsLoadingDoc(false);
      })
      .catch((err: any) => {
        if (!isCurrent) return;
        console.error("[PDF Load Error]", err);
        setError("Failed to load the PDF document. Please verify the file is available or re-upload.");
        setIsLoadingDoc(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [isLibraryLoaded, paperId]);

  // 3. Render the current page onto the canvas
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    let isCurrent = true;

    const renderPage = async () => {
      try {
        setIsRendering(true);

        // Cancel previous rendering task if running
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }

        const page = await pdfDoc.getPage(pageNum);
        if (!isCurrent) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext("2d");
        if (!context) return;

        const viewport = page.getViewport({ scale });

        // High-DPI support: scale canvas dimensions for sharp text
        const dpr = window.devicePixelRatio || 1;
        canvas.width = viewport.width * dpr;
        canvas.height = viewport.height * dpr;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        context.scale(dpr, dpr);

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;

        await renderTask.promise;
        if (isCurrent) {
          setIsRendering(false);
        }
      } catch (err: any) {
        if (err.name !== "RenderingCancelledException") {
          console.error("[PDF Render Error]", err);
          setIsRendering(false);
        }
      }
    };

    renderPage();

    return () => {
      isCurrent = false;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [pdfDoc, pageNum, scale]);

  const handlePrevPage = () => {
    if (pageNum > 1) {
      setPageNum((prev) => prev - 1);
    }
  };

  const handleNextPage = () => {
    if (pdfDoc && pageNum < numPages) {
      setPageNum((prev) => prev + 1);
    }
  };

  const handleZoomIn = () => {
    setScale((prev) => Math.min(3.0, prev + 0.2));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(0.5, prev - 0.2));
  };

  const handleFitToWidth = () => {
    if (!containerRef.current || !pdfDoc) return;
    const containerWidth = containerRef.current.clientWidth - 32; // subtract padding
    pdfDoc.getPage(pageNum).then((page: any) => {
      const viewport = page.getViewport({ scale: 1.0 });
      const newScale = containerWidth / viewport.width;
      setScale(Math.max(0.5, Math.min(2.5, newScale)));
    });
  };

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = `/api/papers/${paperId}/pdf`;
    link.download = `${paperId}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenInNewTab = () => {
    window.open(`/api/papers/${paperId}/pdf`, "_blank");
  };

  return (
    <div ref={containerRef} className="flex flex-col h-full w-full bg-slate-100 rounded-2xl overflow-hidden border border-black/[0.08] shadow-sm">
      {/* Viewer Header / Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-white border-b border-black/[0.06] shrink-0 select-none shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <div className="flex items-center gap-1">
          <button
            onClick={handlePrevPage}
            disabled={pageNum <= 1 || isLoadingDoc}
            className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 text-gray-700 transition cursor-pointer"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          
          <span className="text-xs font-semibold text-gray-700 min-w-[70px] text-center font-mono bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-md">
            {isLoadingDoc ? "-- / --" : `${pageNum} / ${numPages}`}
          </span>

          <button
            onClick={handleNextPage}
            disabled={pageNum >= numPages || isLoadingDoc}
            className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 text-gray-700 transition cursor-pointer"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleZoomOut}
            disabled={isLoadingDoc}
            className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 text-gray-700 transition cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-[11px] font-bold text-gray-500 font-mono min-w-[40px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            disabled={isLoadingDoc}
            className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 text-gray-700 transition cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleFitToWidth}
            disabled={isLoadingDoc}
            className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 text-gray-700 transition cursor-pointer ml-1"
            title="Fit to Width"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleOpenInNewTab}
            disabled={isLoadingDoc}
            className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 text-gray-600 transition cursor-pointer flex items-center gap-1 text-[11px] font-bold"
            title="Open in new window"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Open Tab</span>
          </button>
          <button
            onClick={handleDownload}
            disabled={isLoadingDoc}
            className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 text-gray-600 transition cursor-pointer flex items-center gap-1 text-[11px] font-bold border border-transparent hover:border-slate-200"
            title="Download PDF"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Download</span>
          </button>
        </div>
      </div>

      {/* Viewport Area */}
      <div className="flex-1 overflow-auto p-4 flex justify-center items-start bg-slate-50 relative min-h-0">
        {/* Loading / Error States */}
        {!isLibraryLoaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 gap-2.5 z-10 animate-pulse">
            <Loader2 className="w-6 h-6 text-[#6C5CE7] animate-spin" />
            <span className="text-xs text-gray-500 font-semibold">Configuring PDF reader core...</span>
          </div>
        )}

        {isLoadingDoc && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 gap-2.5 z-10">
            <Loader2 className="w-6 h-6 text-[#6C5CE7] animate-spin" />
            <span className="text-xs text-gray-500 font-semibold">Loading paper layout...</span>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 p-6 text-center z-10">
            <div className="bg-red-50 text-red-600 px-4 py-3.5 rounded-xl border border-red-100 max-w-md shadow-sm">
              <span className="text-sm font-bold block mb-1">Rendering Constraint</span>
              <p className="text-xs leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {/* Canvas Display */}
        <div className="bg-white shadow-[0_4px_16px_rgba(0,0,0,0.06)] border border-black/10 rounded-md overflow-hidden relative max-w-full">
          <canvas ref={canvasRef} className="block max-w-full" />
          
          {/* Subtle Overlay while rendering updates */}
          {isRendering && (
            <div className="absolute bottom-3 right-3 bg-white/90 backdrop-blur-sm border border-black/[0.05] shadow-sm rounded-lg px-2 py-1 flex items-center gap-1.5 select-none animate-fade-in">
              <Loader2 className="w-3 h-3 text-[#6C5CE7] animate-spin" />
              <span className="text-[10px] text-gray-500 font-semibold font-mono">Rendering...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
