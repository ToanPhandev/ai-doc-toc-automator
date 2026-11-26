import React, { useCallback, useRef, useState } from 'react';
import { Archive, CheckCircle, Layers, Trash2 } from 'lucide-react';
import { Header } from './components/Header';
import { JobCard } from './components/JobCard';
import { PdfPreviewModal } from './components/PdfPreviewModal';
import { TocInspectorModal } from './components/TocInspectorModal';
import { UploadDropzone } from './components/UploadDropzone';
import { useLanguage } from './i18n/LanguageContext';
import { HeadingItem, ProcessedJob } from './types/toc';
import { getBaseName } from './utils/headingParser';
import type { BodyParagraphRenderItem } from './utils/pdfRenderer';

export const App: React.FC = () => {
  const { t, language } = useLanguage();
  const [jobs, setJobs] = useState<ProcessedJob[]>([]);
  const [editingJob, setEditingJob] = useState<ProcessedJob | null>(null);
  const [previewPdf, setPreviewPdf] = useState<{ title: string; url: string } | null>(null);
  const [isZipping, setIsZipping] = useState(false);

  // Bộ nhớ đệm phục vụ tái tạo nhanh khi người dùng sửa đề mục thủ công
  const wordParagraphsCache = useRef<Map<string, BodyParagraphRenderItem[]>>(new Map());
  const pdfContentBytesCache = useRef<Map<string, Uint8Array | ArrayBuffer>>(new Map());

  const updateJobState = useCallback(
    (jobId: string, updater: (prev: ProcessedJob) => ProcessedJob) => {
      setJobs((prevJobs) => prevJobs.map((j) => (j.id === jobId ? updater(j) : j)));
    },
    []
  );

  const runSingleFileJob = useCallback(
    async (file: File, jobId: string, flow: 'A' | 'B') => {
      try {
        if (flow === 'A') {
          const { processWordDocument } = await import('./utils/wordProcessor');
          const result = await processWordDocument(file, (stepLabel, progress) => {
            updateJobState(jobId, (prev) => ({ ...prev, stepLabel, progress }));
          });
          wordParagraphsCache.current.set(jobId, result.paragraphs);

          updateJobState(jobId, (prev) => ({
            ...prev,
            status: 'done',
            stepLabel: language === 'en' ? 'Completed' : 'Hoàn tất',
            progress: 100,
            baseName: result.baseName,
            headings: result.headings,
            totalPages: result.totalPages,
            outputs: result.outputs,
          }));
        } else {
          const { processPdfDocument } = await import('./utils/pdfProcessor');
          const result = await processPdfDocument(file, (stepLabel, progress) => {
            updateJobState(jobId, (prev) => ({ ...prev, stepLabel, progress }));
          });

          // Lưu bản PDF nội dung để tái tạo nhanh nếu sửa TOC
          pdfContentBytesCache.current.set(jobId, result.workingContentPdfBytes);

          updateJobState(jobId, (prev) => ({
            ...prev,
            status: 'done',
            stepLabel: language === 'en' ? 'Completed' : 'Hoàn tất',
            progress: 100,
            baseName: result.baseName,
            headings: result.headings,
            hadExistingPageNumbers: result.hadExistingPageNumbers,
            totalPages: result.totalPages,
            outputs: result.outputs,
          }));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error processing document';
        updateJobState(jobId, (prev) => ({
          ...prev,
          status: 'error',
          stepLabel: language === 'en' ? 'Error' : 'Lỗi xử lý',
          errorMessage: message,
        }));
      }
    },
    [language, updateJobState]
  );

  const handleFilesSelected = useCallback(
    (incomingFiles: File[]) => {
      const validFiles = incomingFiles.filter((f) => {
        const lower = f.name.toLowerCase();
        return lower.endsWith('.docx') || lower.endsWith('.doc') || lower.endsWith('.pdf');
      });

      if (validFiles.length === 0) {
        alert(language === 'en' ? 'Please select .doc, .docx or .pdf files' : 'Vui lòng chọn tệp có định dạng .doc, .docx hoặc .pdf');
        return;
      }

      const newJobs: ProcessedJob[] = validFiles.map((file, index) => {
        const isPdf = file.name.toLowerCase().endsWith('.pdf');
        return {
          id: `job-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
          originalFile: file,
          baseName: getBaseName(file.name),
          flow: isPdf ? 'B' : 'A',
          status: 'processing',
          stepLabel: language === 'en' ? 'Initializing...' : 'Đang khởi tạo...',
          progress: 5,
          headings: [],
          outputs: [],
        };
      });

      setJobs((prev) => [...newJobs, ...prev]);

      // Tự động chạy từng file ngay lập tức
      newJobs.forEach((job) => {
        void runSingleFileJob(job.originalFile, job.id, job.flow);
      });
    },
    [language, runSingleFileJob]
  );

  const handleRunSampleWord = async () => {
    const { createSampleWordFile } = await import('./utils/sampleGenerator');
    const sampleFile = await createSampleWordFile();
    handleFilesSelected([sampleFile]);
  };

  const handleRunSamplePdfNoNumber = async () => {
    const { createSamplePdfFile } = await import('./utils/sampleGenerator');
    const sampleFile = await createSamplePdfFile(false);
    handleFilesSelected([sampleFile]);
  };

  const handleRunSamplePdfWithNumber = async () => {
    const { createSamplePdfFile } = await import('./utils/sampleGenerator');
    const sampleFile = await createSamplePdfFile(true);
    handleFilesSelected([sampleFile]);
  };

  const handleSaveCustomHeadings = async (jobId: string, updatedHeadings: HeadingItem[]) => {
    const targetJob = jobs.find((j) => j.id === jobId);
    if (!targetJob) return;

    if (targetJob.flow === 'A') {
      const { rebuildWordOutputs } = await import('./utils/wordProcessor');
      const cachedParas = wordParagraphsCache.current.get(jobId) || [];
      const newOutputs = await rebuildWordOutputs(
        targetJob.originalFile,
        targetJob.baseName,
        updatedHeadings,
        cachedParas
      );
      updateJobState(jobId, (prev) => ({
        ...prev,
        headings: updatedHeadings,
        outputs: newOutputs,
      }));
    } else {
      // Luồng B: Tái tạo 3 tệp đầu ra với danh sách mục lục mới
      const { buildPdfFlowOutputs, processPdfDocument } = await import('./utils/pdfProcessor');
      let contentBytes = pdfContentBytesCache.current.get(jobId);
      if (!contentBytes) {
        const result = await processPdfDocument(targetJob.originalFile);
        contentBytes = result.workingContentPdfBytes;
        pdfContentBytesCache.current.set(jobId, contentBytes);
      }
      const newOutputs = await buildPdfFlowOutputs(
        targetJob.baseName,
        updatedHeadings,
        contentBytes
      );
      updateJobState(jobId, (prev) => ({
        ...prev,
        headings: updatedHeadings,
        outputs: newOutputs,
      }));
    }
  };

  const handleRemoveJob = (jobId: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
    wordParagraphsCache.current.delete(jobId);
    pdfContentBytesCache.current.delete(jobId);
  };

  const handleDownloadAllZip = async () => {
    const completedJobs = jobs.filter((j) => j.status === 'done' && j.outputs.length > 0);
    if (completedJobs.length === 0) return;

    setIsZipping(true);
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      for (const job of completedJobs) {
        const folder = completedJobs.length > 1 ? zip.folder(job.baseName)! : zip;
        for (const out of job.outputs) {
          folder.file(out.name, out.blob);
        }
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${t.app.zipFileName}_${completedJobs.length}_files.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setIsZipping(false);
    }
  };

  const isAnyBusy = jobs.some((j) => j.status === 'processing');
  const completedCount = jobs.filter((j) => j.status === 'done').length;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Header />

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        {/* Khu vực tải file / chạy mẫu tự động */}
        <UploadDropzone
          onFilesSelected={handleFilesSelected}
          onRunSampleWord={handleRunSampleWord}
          onRunSamplePdfNoNumber={handleRunSamplePdfNoNumber}
          onRunSamplePdfWithNumber={handleRunSamplePdfWithNumber}
          isBusy={isAnyBusy}
        />

        {/* Thanh công cụ quản lý danh sách kết quả */}
        {jobs.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-xs sm:px-6">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 sm:text-sm">
              <Layers className="h-4 w-4 text-blue-600" />
              <span>
                {t.app.docListTitle} ({completedCount}/{jobs.length} {t.app.completedCount})
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {completedCount > 0 && (
                <button
                  type="button"
                  disabled={isZipping}
                  onClick={handleDownloadAllZip}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Archive className="h-4 w-4" />
                  {isZipping ? t.app.zipping : t.app.downloadAllZip}
                </button>
              )}

              <button
                type="button"
                onClick={() => setJobs([])}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t.app.clearList}
              </button>
            </div>
          </div>
        )}

        {/* Danh sách các thẻ tài liệu đang xử lý / đã hoàn tất */}
        {jobs.length > 0 ? (
          <div className="space-y-4">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onOpenTocEditor={(j) => setEditingJob(j)}
                onPreviewPdf={(title, url) => setPreviewPdf({ title, url })}
                onRemoveJob={handleRemoveJob}
              />
            ))}
          </div>
        ) : (
          /* Tóm tắt quy chuẩn 2 luồng khi chưa có tài liệu nào */
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                <CheckCircle className="h-3.5 w-3.5" />
                {t.app.flowABoxTitle}
              </div>
              <ul className="mt-2 space-y-1.5 text-xs text-slate-600 sm:text-sm">
                <li>• {t.app.flowABoxPoint1}</li>
                <li>• {t.app.flowABoxPoint2}</li>
                <li>• {t.app.flowABoxPoint3}</li>
                <li>• {t.app.flowABoxPoint4}</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                <CheckCircle className="h-3.5 w-3.5" />
                {t.app.flowBBoxTitle}
              </div>
              <ul className="mt-2 space-y-1.5 text-xs text-slate-600 sm:text-sm">
                <li>• {t.app.flowBBoxPoint1}</li>
                <li>• {t.app.flowBBoxPoint2}</li>
                <li>• {t.app.flowBBoxPoint3}</li>
                <li>• {t.app.flowBBoxPoint4}</li>
              </ul>
            </div>
          </section>
        )}
      </main>

      {/* Modal chỉnh sửa danh sách đề mục */}
      {editingJob && (
        <TocInspectorModal
          job={editingJob}
          onClose={() => setEditingJob(null)}
          onSaveHeadings={handleSaveCustomHeadings}
        />
      )}

      {/* Modal xem trước trực tiếp tệp PDF */}
      {previewPdf && (
        <PdfPreviewModal
          title={previewPdf.title}
          url={previewPdf.url}
          onClose={() => setPreviewPdf(null)}
        />
      )}
    </div>
  );
};

export default App;
