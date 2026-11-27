export interface HeadingItem {
  id: string;
  level: 1 | 2;
  title: string;
  pageNumber: number;
  paragraphIndex?: number;
  mergedNextIndex?: number;
  mergedIndices?: number[];
}

export interface CandidateBlock {
  text: string;
  isBold: boolean;
  fontSize: number;
  pageNumber: number;
  paragraphIndex: number;
  styleLevel?: 1 | 2 | null;
  isCentered?: boolean;
}

export interface OutputFileItem {
  name: string;
  blob: Blob;
  url: string;
  kind: 'docx' | 'pdf';
  description: string;
}

export interface ProcessedJob {
  id: string;
  originalFile: File;
  baseName: string;
  flow: 'A' | 'B';
  status: 'queued' | 'processing' | 'done' | 'error';
  stepLabel: string;
  progress: number;
  headings: HeadingItem[];
  hadExistingPageNumbers?: boolean;
  totalPages?: number;
  outputs: OutputFileItem[];
  errorMessage?: string;
}
