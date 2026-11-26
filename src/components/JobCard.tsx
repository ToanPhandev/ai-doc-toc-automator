import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  FileCode2,
  FileText,
  Loader2,
  Trash2,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
import { OutputFileItem, ProcessedJob } from '../types/toc';

interface JobCardProps {
  job: ProcessedJob;
  onOpenTocEditor: (job: ProcessedJob) => void;
  onPreviewPdf: (title: string, url: string) => void;
  onRemoveJob: (id: string) => void;
}

export const JobCard: React.FC<JobCardProps> = ({
  job,
  onOpenTocEditor,
  onPreviewPdf,
  onRemoveJob,
}) => {
  const { t } = useLanguage();
  const printPdfOutput: OutputFileItem | undefined = job.outputs.find((o) =>
    o.name.endsWith('(in ấn).pdf')
  );

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs transition hover:shadow-md">
      {/* Thanh tiêu đề thẻ tài liệu */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`inline-flex shrink-0 items-center rounded-lg px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${
              job.flow === 'A'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-emerald-100 text-emerald-800'
            }`}
          >
            {job.flow === 'A' ? t.jobCard.flowA : t.jobCard.flowB}
          </span>

          <h3 className="truncate text-sm font-bold text-slate-900 sm:text-base">
            {job.originalFile.name}
          </h3>
        </div>

        <div className="flex items-center gap-2">
          {job.status === 'processing' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {job.stepLabel} ({job.progress}%)
            </span>
          )}

          {job.status === 'done' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t.jobCard.statusDone} ({job.headings.length} {t.jobCard.headingsCount})
            </span>
          )}

          {job.status === 'error' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
              <AlertCircle className="h-3.5 w-3.5" />
              {t.jobCard.statusError}
            </span>
          )}

          <button
            type="button"
            onClick={() => onRemoveJob(job.id)}
            title={t.jobCard.removeTooltip}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-200/60 hover:text-slate-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Thanh tiến trình tự động khi đang chạy */}
      {job.status === 'processing' && (
        <div className="px-4 py-6 sm:px-6">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-blue-600 transition-all duration-300"
              style={{ width: `${job.progress}%` }}
            />
          </div>
          <p className="mt-2 text-center text-xs text-slate-500">{job.stepLabel}</p>
        </div>
      )}

      {/* Thông báo lỗi nếu có */}
      {job.status === 'error' && (
        <div className="p-4 text-sm text-rose-600 sm:px-6">
          {t.jobCard.statusError}: {job.errorMessage}
        </div>
      )}

      {/* Nội dung kết quả khi đã hoàn tất */}
      {job.status === 'done' && (
        <div className="grid grid-cols-1 gap-6 p-4 sm:p-6 lg:grid-cols-12">
          {/* Cột trái: Bản xem trước Trang Mục lục chuẩn Times New Roman & Tab Leader chấm bi */}
          <div className="lg:col-span-7">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {t.jobCard.inspectTocBtn} (Times New Roman)
                </span>
                {job.flow === 'B' && (
                  <span
                    className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                      job.hadExistingPageNumbers
                        ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-600/20'
                        : 'bg-blue-50 text-blue-800 ring-1 ring-blue-600/20'
                    }`}
                  >
                    {job.hadExistingPageNumbers
                      ? t.jobCard.preservedPagesBadge
                      : t.jobCard.stampedPagesBadge}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => onOpenTocEditor(job)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
              >
                <Edit3 className="h-3.5 w-3.5" />
                {t.jobCard.inspectTocBtn}
              </button>
            </div>

            {/* Khung mô phỏng trang giấy A4 chuẩn Times New Roman */}
            <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-[#fffefc] p-4 font-serif text-slate-900 shadow-inner sm:p-5">
              <div className="text-center text-sm font-bold uppercase tracking-wide sm:text-base">
                {job.baseName}
              </div>
              <div className="mb-3 text-center text-sm font-bold uppercase sm:text-base">
                TABLE OF CONTENTS / MỤC LỤC
              </div>

              {job.headings.length === 0 ? (
                <p className="py-4 text-center text-xs italic text-slate-500">
                  {t.tocModal.emptyNotice}
                </p>
              ) : (
                <ul className="space-y-1.5 text-xs sm:text-[13.5px]">
                  {job.headings.map((h) => (
                    <li
                      key={h.id}
                      className={`flex items-baseline justify-between gap-1 ${
                        h.level === 1 ? 'font-bold' : 'pl-4 font-normal'
                      }`}
                    >
                      <span className="shrink-0 max-w-[78%] break-words">{h.title}</span>
                      <span
                        className="mx-1 flex-1 overflow-hidden border-b border-dotted border-slate-400"
                        aria-hidden="true"
                      />
                      <span className="shrink-0 font-semibold tabular-nums">
                        {h.pageNumber}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Cột phải: Danh sách các tệp đầu ra bắt buộc để xem trước & tải về */}
          <div className="flex flex-col justify-between lg:col-span-5">
            <div>
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {job.outputs.length} {t.app.docListTitle}
                </span>
                {printPdfOutput && (
                  <button
                    type="button"
                    onClick={() => onPreviewPdf(printPdfOutput.name, printPdfOutput.url)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {t.jobCard.previewPdfBtn}
                  </button>
                )}
              </div>

              <div className="space-y-2.5">
                {job.outputs.map((out) => (
                  <div
                    key={out.name}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 transition hover:border-blue-300 hover:bg-white"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                          out.kind === 'docx'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {out.kind === 'docx' ? (
                          <FileCode2 className="h-4 w-4" />
                        ) : (
                          <FileText className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-slate-900 sm:text-sm">
                          {out.name}
                        </p>
                        <p className="truncate text-[11px] text-slate-500">
                          {out.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {out.kind === 'pdf' && (
                        <button
                          type="button"
                          onClick={() => onPreviewPdf(out.name, out.url)}
                          title={t.jobCard.previewPdfBtn}
                          className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition hover:border-blue-400 hover:text-blue-600"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      )}
                      <a
                        href={out.url}
                        download={out.name}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-blue-700"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>{t.jobCard.downloadBtn}</span>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </article>
  );
};
