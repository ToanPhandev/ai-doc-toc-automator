import React from 'react';
import { Download, ExternalLink, X } from 'lucide-react';

interface PdfPreviewModalProps {
  title: string;
  url: string;
  onClose: () => void;
}

export const PdfPreviewModal: React.FC<PdfPreviewModalProps> = ({
  title,
  url,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-2 backdrop-blur-xs sm:p-5">
      <div className="flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 sm:px-6">
          <h3 className="truncate text-sm font-bold text-slate-900 sm:text-base">
            Xem trước: {title}
          </h3>
          <div className="flex items-center gap-2">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Mở tab mới
            </a>
            <a
              href={url}
              download={title}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
            >
              <Download className="h-3.5 w-3.5" />
              Tải về
            </a>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="relative flex-1 bg-slate-800">
          <iframe
            src={url}
            title={title}
            className="h-full w-full border-0"
          />
        </div>
      </div>
    </div>
  );
};
