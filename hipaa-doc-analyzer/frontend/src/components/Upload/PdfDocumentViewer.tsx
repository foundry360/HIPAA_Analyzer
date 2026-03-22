import { useRef, useState, useLayoutEffect, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

/**
 * Worker is copied from node_modules/pdfjs-dist into public/ by `postinstall`
 * so its version always matches the installed pdfjs-dist (avoids stale Vite ?url assets).
 */
pdfjs.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`;

type Props = {
  /** Blob URL or any URL the PDF.js worker can fetch */
  fileUrl: string;
  /** When true, pages are centered in the viewing area (e.g. PDF-only full-width layout). */
  centerPages?: boolean;
};

export function PdfDocumentViewer({ fileUrl, centerPages = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageWidth, setPageWidth] = useState(720);
  const [numPages, setNumPages] = useState<number | null>(null);

  useEffect(() => {
    setNumPages(null);
  }, [fileUrl]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      setPageWidth(Math.max(240, Math.min(w - 8, 920)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={`pdf-viewer min-h-0 w-full overflow-auto bg-white px-0 pb-2 pt-0 ${
        centerPages ? 'flex flex-col items-center' : ''
      }`}
    >
      <Document
        file={fileUrl}
        onLoadSuccess={({ numPages: n }) => setNumPages(n)}
        loading={
          <div className="py-12 text-center text-sm text-slate-500">Loading PDF…</div>
        }
        error={
          <div className="py-12 text-center text-sm text-red-600">
            Could not display this PDF. Try downloading the file or use a different browser.
          </div>
        }
        className={`flex flex-col gap-10 ${centerPages ? 'items-center' : 'items-stretch'}`}
      >
        {numPages !== null &&
          Array.from({ length: numPages }, (_, i) => (
            <div
              key={i + 1}
              className="pdf-page-clip flex justify-center overflow-hidden rounded-sm bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
            >
              <Page
                pageNumber={i + 1}
                width={pageWidth}
                renderTextLayer
                renderAnnotationLayer
                className="!bg-white"
              />
            </div>
          ))}
      </Document>
    </div>
  );
}
