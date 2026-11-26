import type { WorkerResponse, WorkerTaskRequest } from './docWorker';

export interface DocumentTaskResult {
  baseName: string;
  headings: any[];
  totalPages: number;
  outputs: any[];
  paragraphs?: any[];
  hadExistingPageNumbers?: boolean;
  workingContentPdfBytes?: any;
}

export function canUseWorker(): boolean {
  return typeof Worker !== 'undefined';
}

export function executeTaskWithWorker(
  file: File,
  taskId: string,
  flow: 'A' | 'B',
  onProgress: (stepLabel: string, progress: number) => void
): Promise<DocumentTaskResult> {
  return new Promise((resolve, reject) => {
    try {
      const worker = new Worker(new URL('./docWorker.ts', import.meta.url), {
        type: 'module',
      });

      worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const msg = e.data;
        if (msg.taskId !== taskId) return;

        if (msg.type === 'progress') {
          onProgress(msg.stepLabel, msg.progress);
        } else if (msg.type === 'done') {
          worker.terminate();
          resolve(msg as unknown as DocumentTaskResult);
        } else if (msg.type === 'error') {
          worker.terminate();
          reject(new Error(msg.errorMessage));
        }
      };

      worker.onerror = (err) => {
        worker.terminate();
        reject(err instanceof Error ? err : new Error('Web Worker error'));
      };

      const request: WorkerTaskRequest = {
        taskId,
        flow,
        file,
      };
      worker.postMessage(request);
    } catch (err) {
      reject(err);
    }
  });
}

export async function processDocumentWithFallback(
  file: File,
  jobId: string,
  flow: 'A' | 'B',
  onProgress: (stepLabel: string, progress: number) => void
): Promise<DocumentTaskResult> {
  if (canUseWorker()) {
    try {
      return await executeTaskWithWorker(file, jobId, flow, onProgress);
    } catch (e) {
      console.warn('Worker execution failed, falling back to direct processing:', e);
    }
  }

  // Fallback sang luồng thường nếu môi trường không hỗ trợ Web Worker
  if (flow === 'A') {
    const { processWordDocument } = await import('../utils/wordProcessor');
    return await processWordDocument(file, onProgress);
  } else {
    const { processPdfDocument } = await import('../utils/pdfProcessor');
    return await processPdfDocument(file, onProgress);
  }
}
