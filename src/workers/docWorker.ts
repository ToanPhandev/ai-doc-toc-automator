import { HeadingItem, OutputFileItem } from '../types/toc';
import { processPdfDocument } from '../utils/pdfProcessor';
import { processWordDocument } from '../utils/wordProcessor';

export interface WorkerTaskRequest {
  taskId: string;
  flow: 'A' | 'B';
  file: File;
}

export type WorkerResponse =
  | {
      type: 'progress';
      taskId: string;
      stepLabel: string;
      progress: number;
    }
  | {
      type: 'done';
      taskId: string;
      flow: 'A';
      baseName: string;
      headings: HeadingItem[];
      totalPages: number;
      outputs: OutputFileItem[];
      paragraphs: any[];
    }
  | {
      type: 'done';
      taskId: string;
      flow: 'B';
      baseName: string;
      headings: HeadingItem[];
      totalPages: number;
      hadExistingPageNumbers: boolean;
      outputs: OutputFileItem[];
      workingContentPdfBytes: ArrayBuffer | Uint8Array;
    }
  | {
      type: 'error';
      taskId: string;
      errorMessage: string;
    };

self.onmessage = async (e: MessageEvent<WorkerTaskRequest>) => {
  const { taskId, flow, file } = e.data;

  try {
    if (flow === 'A') {
      const result = await processWordDocument(file, (stepLabel, progress) => {
        const msg: WorkerResponse = {
          type: 'progress',
          taskId,
          stepLabel,
          progress,
        };
        self.postMessage(msg);
      });

      const doneMsg: WorkerResponse = {
        type: 'done',
        taskId,
        flow: 'A',
        baseName: result.baseName,
        headings: result.headings,
        totalPages: result.totalPages,
        outputs: result.outputs,
        paragraphs: result.paragraphs,
      };
      self.postMessage(doneMsg);
    } else {
      const result = await processPdfDocument(file, (stepLabel, progress) => {
        const msg: WorkerResponse = {
          type: 'progress',
          taskId,
          stepLabel,
          progress,
        };
        self.postMessage(msg);
      });

      const doneMsg: WorkerResponse = {
        type: 'done',
        taskId,
        flow: 'B',
        baseName: result.baseName,
        headings: result.headings,
        totalPages: result.totalPages,
        hadExistingPageNumbers: result.hadExistingPageNumbers,
        outputs: result.outputs,
        workingContentPdfBytes: result.workingContentPdfBytes,
      };
      self.postMessage(doneMsg);
    }
  } catch (err) {
    const errorMsg: WorkerResponse = {
      type: 'error',
      taskId,
      errorMessage: err instanceof Error ? err.message : 'Lỗi không xác định khi xử lý tệp.',
    };
    self.postMessage(errorMsg);
  }
};
