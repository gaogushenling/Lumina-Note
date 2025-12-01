import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { InteractiveLayer } from "./InteractiveLayer";
import type { PDFElement } from "@/types/pdf";

// 配置 PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// 引入 react-pdf 样式
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

interface PDFCanvasProps {
  pdfData: Uint8Array | null;
  filePath: string; // 仅用于错误显示
  currentPage: number;
  scale: number;
  onDocumentLoad?: (numPages: number) => void;
  onPageChange?: (page: number) => void;
  // 交互层相关
  showInteractiveLayer?: boolean;
  elements?: PDFElement[];
  selectedElementIds?: string[];
  hoveredElementId?: string | null;
  onElementHover?: (elementId: string | null) => void;
  onElementClick?: (element: PDFElement, isMultiSelect: boolean) => void;
  className?: string;
}

export function PDFCanvas({
  pdfData,
  filePath,
  currentPage,
  scale,
  onDocumentLoad,
  onPageChange,
  showInteractiveLayer = false,
  elements = [],
  selectedElementIds = [],
  hoveredElementId = null,
  onElementHover,
  onElementClick,
  className,
}: PDFCanvasProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 处理文档加载
  const handleDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setError(null);
    onDocumentLoad?.(numPages);
  }, [onDocumentLoad]);

  // 处理页面加载成功
  const handlePageLoadSuccess = useCallback((page: any) => {
    const viewport = page.getViewport({ scale: 1 });
    setPageSize({ width: viewport.width, height: viewport.height });
  }, []);

  // 处理加载错误
  const handleDocumentLoadError = useCallback((err: Error) => {
    console.error("PDF load error:", err);
    setError(`加载失败: ${err.message}`);
  }, []);

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!onPageChange) return;
      
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        if (currentPage > 1) onPageChange(currentPage - 1);
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        if (currentPage < numPages) onPageChange(currentPage + 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        onPageChange(1);
      } else if (e.key === "End") {
        e.preventDefault();
        onPageChange(numPages);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentPage, numPages, onPageChange]);

  // 创建 PDF 数据源（避免 ArrayBuffer detached）
  const pdfSource = useMemo(() => {
    if (!pdfData) return null;
    // 确保每次都是新的副本，独立的 ArrayBuffer
    const buffer = new ArrayBuffer(pdfData.byteLength);
    const copy = new Uint8Array(buffer);
    copy.set(new Uint8Array(pdfData.buffer, pdfData.byteOffset, pdfData.byteLength));
    return { data: copy };
  }, [pdfData]);

  if (error) {
    return (
      <div className={cn("flex-1 flex items-center justify-center", className)}>
        <div className="text-center text-destructive">
          <p className="text-lg font-medium">PDF 加载失败</p>
          <p className="text-sm text-muted-foreground mt-1">{error}</p>
          <p className="text-xs text-muted-foreground mt-2">{filePath}</p>
        </div>
      </div>
    );
  }

  // 正在加载文件
  if (!pdfSource) {
    return (
      <div className={cn("flex-1 flex items-center justify-center", className)}>
        <Loader2 className="animate-spin mr-2" />
        <span>读取文件...</span>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={cn(
        "flex-1 overflow-auto bg-muted/30",
        className
      )}
    >
      <Document
        file={pdfSource}
        onLoadSuccess={handleDocumentLoadSuccess}
        onLoadError={handleDocumentLoadError}
        loading={
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin mr-2" />
            <span>解析 PDF...</span>
          </div>
        }
        className="flex flex-col items-center py-4"
      >
        <div className="relative shadow-lg">
          <Page
            pageNumber={currentPage}
            scale={scale}
            onLoadSuccess={handlePageLoadSuccess}
            loading={
              <div className="flex items-center justify-center py-10">
                <Loader2 className="animate-spin" size={20} />
              </div>
            }
            className="bg-white"
          />
          
          {/* 交互层 */}
          {showInteractiveLayer && pageSize && onElementHover && onElementClick && (
            <InteractiveLayer
              pageIndex={currentPage}
              pageWidth={pageSize.width}
              pageHeight={pageSize.height}
              scale={scale}
              elements={elements}
              selectedElementIds={selectedElementIds}
              hoveredElementId={hoveredElementId}
              onElementHover={onElementHover}
              onElementClick={onElementClick}
            />
          )}
        </div>
      </Document>
    </div>
  );
}
