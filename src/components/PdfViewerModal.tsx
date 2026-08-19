import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { downloadPrivateFile } from "../lib/download";

type PdfViewerModalProps = {
  url: string;
  title: string;
  subtitle?: string;
  fileName?: string;
  onClose: () => void;
};

export function PdfViewerModal({ url, title, subtitle, fileName = "contrato-imobiliaria-oliveira.pdf", onClose }: PdfViewerModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", onKeyDown); };
  }, [onClose]);

  return createPortal(<div className="pdf-viewer-overlay" role="dialog" aria-modal="true" aria-label={title}>
    <div className="pdf-viewer-shell">
      <header className="pdf-viewer-toolbar">
        <div className="pdf-viewer-heading"><span className="pdf-viewer-icon" aria-hidden="true">PDF</span><div><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</div></div>
        <div className="pdf-viewer-actions"><a className="secondary-button" href={url} target="_blank" rel="noreferrer">Abrir em nova aba</a><button className="primary-button" type="button" disabled={downloading} onClick={() => { setDownloading(true); setDownloadError(""); void downloadPrivateFile(url, fileName).catch((error) => setDownloadError(error instanceof Error ? error.message : "Download indisponível.")).finally(() => setDownloading(false)); }}>{downloading ? "Baixando..." : "Baixar cópia"}</button><button ref={closeRef} className="pdf-viewer-close" type="button" onClick={onClose} aria-label="Fechar visualização">×</button></div>
      </header>
      <div className="pdf-viewer-canvas"><iframe src={`${url}#view=FitH&toolbar=1&navpanes=0`} title={title} /></div>
      <footer className="pdf-viewer-footer"><span>{downloadError || "Documento privado"}</span><span>Use os controles do visualizador para ampliar ou navegar pelas páginas.</span></footer>
    </div>
  </div>, document.body);
}
