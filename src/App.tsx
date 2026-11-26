import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, Layers, Trash2 } from 'lucide-react';
import { Header } from './components/Header';
import { JobCard } from './components/JobCard';
import { PdfPreviewModal } from './components/PdfPreviewModal';
import { TocInspectorModal } from './components/TocInspectorModal';
import { UploadDropzone } from './components/UploadDropzone';
import { useLanguage } from './i18n/LanguageContext';
import { HeadingItem, ProcessedJob } from './types/toc';
import { getBaseName } from './utils/headingParser';
import type { BodyParagraphRenderItem } from './utils/pdfRenderer';
import { processDocumentWithFallback } from './workers/workerManager';

// Tối đa 5 Web Worker chạy song song ở luồng ngầm độc lập
const MAX_CONCURRENT_JOBS = 5;

export const App: React.FC = () => {
  const { t, language } = useLanguage();
  const [jobs, setJobs] = useState<ProcessedJob[]>([]);
  const [editingJob, setEditingJob] = useState<ProcessedJob | null>(null);
  const [previewPdf, setPreviewPdf] = useState<{ title: string; url: string } | null>(null);
  const [isZipping, setIsZipping] = useState(false);

  // Bộ nhớ đệm phục vụ tái tạo nhanh khi người dùng sửa đề mục thủ công
  const wordParagraphsCache = useRef<Map<string, BodyParagraphRenderItem[]>>(new Map());
  const pdfContentBytesCache = useRef<Map<string, Uint8Array | ArrayBuffer>>(new Map());

  // Lưu vết danh sách ID của các tác vụ đang được kích hoạt chạy để tránh gọi đúp
  const runningJobIdsRef = useRef<Set<string>>(new Set());

  const updateJobState = useCallback(
    (jobId: string, updater: (prev: ProcessedJob) => ProcessedJob) => {
      setJobs((prevJobs) => prevJobs.map((j) => (j.id === jobId ? updater(j) : j)));
    },
    []
  );

  const runSingleFileJob = useCallback(
    async (file: File, jobId: string, flow: 'A' | 'B') => {
      try {
        const result = await processDocumentWithFallback(
          file,
          jobId,
          flow,
          (stepLabel, progress) => {
            updateJobState(jobId, (prev) => ({ ...prev, stepLabel, progress }));
          }
        );

        if (flow === 'A' && result.paragraphs) {
          wordParagraphsCache.current.set(jobId, result.paragraphs);
        } else if (flow === 'B' && result.workingContentPdfBytes) {
          pdfContentBytesCache.current.set(jobId, result.workingContentPdfBytes);
        }

        updateJobState(jobId, (prev) => ({
          ...prev,
          status: 'done',
          stepLabel: language === 'en' ? 'Completed' : 'Hoàn tất',
          progress: 100,
          baseName: result.baseName,
          headings: result.headings,
          totalPages: result.totalPages,
          hadExistingPageNumbers: result.hadExistingPageNumbers,
          outputs: result.outputs,
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error processing document';
        updateJobState(jobId, (prev) => ({
          ...prev,
          status: 'error',
          stepLabel: language === 'en' ? 'Error' : 'Lỗi xử lý',
          errorMessage: message,
        }));
      } finally {
        runningJobIdsRef.current.delete(jobId);
      }
    },
    [language, updateJobState]
  );

  // Điều phối hàng đợi: Giới hạn tối đa 5 file chạy song song
  useEffect(() => {
    const activeCount = jobs.filter((j) => j.status === 'processing').length;
    const availableSlots = MAX_CONCURRENT_JOBS - activeCount;

    if (availableSlots > 0) {
      const queuedJobs = jobs.filter(
        (j) => j.status === 'queued' && !runningJobIdsRef.current.has(j.id)
      );

      const toStart = queuedJobs.slice(0, availableSlots);

      for (const job of toStart) {
        runningJobIdsRef.current.add(job.id);
        updateJobState(job.id, (prev) => ({
          ...prev,
          status: 'processing',
          stepLabel: language === 'en' ? 'Initializing...' : 'Đang khởi tạo...',
          progress: 5,
        }));
        void runSingleFileJob(job.originalFile, job.id, job.flow);
      }
    }
  }, [jobs, language, runSingleFileJob, updateJobState]);

  const handleFilesSelected = useCallback(
    (incomingFiles: File[]) => {
      const validFiles = incomingFiles.filter((f) => {
        const lower = f.name.toLowerCase();
        return lower.endsWith('.docx') || lower.endsWith('.doc') || lower.endsWith('.pdf');
      });

      if (validFiles.length === 0) {
        alert(
          language === 'en'
            ? 'Please select .doc, .docx or .pdf files'
            : 'Vui lòng chọn tệp có định dạng .doc, .docx hoặc .pdf'
        );
        return;
      }

      // Đưa các tệp vào danh sách với trạng thái ban đầu là "queued" (đang chờ)
      const newJobs: ProcessedJob[] = validFiles.map((file, index) => {
        const isPdf = file.name.toLowerCase().endsWith('.pdf');
        return {
          id: `job-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
          originalFile: file,
          baseName: getBaseName(file.name),
          flow: isPdf ? 'B' : 'A',
          status: 'queued',
          stepLabel: language === 'en' ? 'Queued...' : 'Đang chờ...',
          progress: 0,
          headings: [],
          outputs: [],
        };
      });

      setJobs((prev) => [...newJobs, ...prev]);
    },
    [language]
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
    runningJobIdsRef.current.delete(jobId);
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
    wordParagraphsCache.current.delete(jobId);
    pdfContentBytesCache.current.delete(jobId);
  };

  const handleOpenTocEditor = useCallback((j: ProcessedJob) => {
    setEditingJob(j);
  }, []);

  const handlePreviewPdf = useCallback((title: string, url: string) => {
    setPreviewPdf({ title, url });
  }, []);

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

  const isAnyBusy = jobs.some((j) => j.status === 'processing' || j.status === 'queued');
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
                onClick={() => {
                  runningJobIdsRef.current.clear();
                  setJobs([]);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t.app.clearList}
              </button>
            </div>
          </div>
        )}

        {/* Danh sách các thẻ tài liệu đang xử lý / đã hoàn tất */}
        {jobs.length > 0 && (
          <div className="space-y-4">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onOpenTocEditor={handleOpenTocEditor}
                onPreviewPdf={handlePreviewPdf}
                onRemoveJob={handleRemoveJob}
              />
            ))}
          </div>
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
