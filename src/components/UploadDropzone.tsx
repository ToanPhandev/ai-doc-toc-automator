import React, { useRef, useState } from 'react';
import { FileSpreadsheet, FileText, FlaskConical, UploadCloud } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface UploadDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  onRunSampleWord: () => void;
  onRunSamplePdfNoNumber: () => void;
  onRunSamplePdfWithNumber: () => void;
  isBusy: boolean;
}

export const UploadDropzone: React.FC<UploadDropzoneProps> = ({
  onFilesSelected,
  onRunSampleWord,
  onRunSamplePdfNoNumber,
  onRunSamplePdfWithNumber,
  isBusy,
}) => {
  const { t } = useLanguage();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-all sm:py-12 ${
          isDragging
            ? 'border-blue-600 bg-blue-50/70'
            : 'border-slate-300 bg-slate-50/60 hover:border-blue-500 hover:bg-blue-50/30'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".doc,.docx,.pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-600 transition-transform group-hover:scale-105">
          <UploadCloud className="h-7 w-7" />
        </div>

        <h2 className="text-base font-bold text-slate-900 sm:text-lg">
          {t.dropzone.dragDropTitle}
        </h2>
        <p className="mt-1 max-w-xl text-xs text-slate-500 sm:text-sm">
          {t.dropzone.dragDropSubtitle}
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-xs ring-1 ring-slate-200">
            <FileText className="h-3.5 w-3.5 text-blue-600" />
            Word (.docx, .doc)
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-xs ring-1 ring-slate-200">
            <FileSpreadsheet className="h-3.5 w-3.5 text-rose-600" />
            PDF (.pdf)
          </span>
        </div>
      </div>

      {/* Thanh chạy thử mẫu 1 chạm cho cả Mobile & Desktop */}
      <div className="mt-4 flex flex-col justify-between gap-2.5 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
          <FlaskConical className="h-4 w-4 shrink-0 text-blue-600" />
          <span>{t.dropzone.sampleSectionTitle}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isBusy}
            onClick={onRunSampleWord}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-xs ring-1 ring-slate-200 transition hover:bg-blue-50 disabled:opacity-50 sm:flex-initial"
          >
            {t.dropzone.sampleWordBtn}
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={onRunSamplePdfNoNumber}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-xs ring-1 ring-slate-200 transition hover:bg-emerald-50 disabled:opacity-50 sm:flex-initial"
          >
            {t.dropzone.samplePdfNoNumBtn}
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={onRunSamplePdfWithNumber}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 shadow-xs ring-1 ring-slate-200 transition hover:bg-amber-50 disabled:opacity-50 sm:flex-initial"
          >
            {t.dropzone.samplePdfWithNumBtn}
          </button>
        </div>
      </div>
    </section>
  );
};
