import { PDFDocument, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
import { CandidateBlock, HeadingItem, OutputFileItem } from '../types/toc';
import { buildStandaloneTocDocx } from './docxBuilder';
import { embedVietnameseSerifFonts } from './fontLoader';
import {
  cleanHeadingText,
  ensureDocumentTypePrefix,
  extractOfficialDocumentTitle,
  extractPageNumberFromMarginText,
  formatSmartBaseName,
  getBaseName,
  isValidDocumentTitle,
  parseHeadingsFromBlocks,
} from './headingParser';
import {
  extractTocFromPdfWithGemini,
  extractTocFromScannedPdfWithGemini,
  hasGeminiApiKey,
} from './llmTocService';
import { renderStandaloneTocPdf } from './pdfRenderer';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const HEADER_RATIO = 0.09; // 9% đỉnh trang
const FOOTER_RATIO = 0.09; // 9% đáy trang

export interface PdfProcessResult {
  baseName: string;
  headings: HeadingItem[];
  hadExistingPageNumbers: boolean;
  totalPages: number;
  outputs: OutputFileItem[];
  workingContentPdfBytes: Uint8Array | ArrayBuffer;
}

interface RawPdfTextToken {
  str: string;
  x: number;
  y: number;
  fontSize: number;
  isBold: boolean;
}

function getMedian(values: number[], fallback = 13.0): number {
  if (!values.length) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Thuật toán kiểm tra vùng Header (9% đỉnh trang) và Footer (9% đáy trang)
 * để phát hiện xem PDF gốc đã có sẵn số trang hay chưa.
 */
function detectExistingPageNumbersFromTokens(
  pagesTokens: { pageHeight: number; tokens: RawPdfTextToken[] }[]
): { hasExisting: boolean; pageMap: Map<number, number> } {
  const totalPages = pagesTokens.length;
  const pageMap = new Map<number, number>();
  if (totalPages === 0) return { hasExisting: false, pageMap };

  const candidatesPerPage = new Map<number, Set<number>>();

  pagesTokens.forEach(({ pageHeight, tokens }, pageIdx) => {
    const footerLimitY = pageHeight * FOOTER_RATIO;
    const headerStartY = pageHeight * (1 - HEADER_RATIO);
    const marginTokens = tokens.filter((t) => t.y <= footerLimitY || t.y >= headerStartY);

    const nums = new Set<number>();

    // Xét từng token riêng lẻ
    for (const tk of marginTokens) {
      const n = extractPageNumberFromMarginText(tk.str);
      if (n !== null) nums.add(n);
    }

    // Xét cả các token nối thành dòng trên cùng tọa độ y ở vùng Header/Footer
    const groupedByY: RawPdfTextToken[][] = [];
    const sortedMargin = [...marginTokens].sort((a, b) => b.y - a.y || a.x - b.x);
    for (const tk of sortedMargin) {
      const lastGroup = groupedByY[groupedByY.length - 1];
      if (lastGroup && Math.abs(lastGroup[0].y - tk.y) <= 3.5) {
        lastGroup.push(tk);
      } else {
        groupedByY.push([tk]);
      }
    }
    for (const grp of groupedByY) {
      const lineStr = grp.map((g) => g.str).join(' ');
      const n = extractPageNumberFromMarginText(lineStr);
      if (n !== null) nums.add(n);
    }

    if (nums.size > 0) {
      candidatesPerPage.set(pageIdx, nums);
    }
  });

  if (candidatesPerPage.size === 0) {
    return { hasExisting: false, pageMap };
  }

  // Thống kê độ lệch chuẩn offset = (displayedPageNumber - pageIdx)
  const offsetCounts = new Map<number, number>();
  candidatesPerPage.forEach((nums, pageIdx) => {
    nums.forEach((num) => {
      const offset = num - pageIdx;
      if (offset >= -5 && offset <= 50) {
        offsetCounts.set(offset, (offsetCounts.get(offset) || 0) + 1);
      }
    });
  });

  let bestOffset = 1;
  let bestCount = 0;
  offsetCounts.forEach((count, offset) => {
    if (count > bestCount) {
      bestCount = count;
      bestOffset = offset;
    }
  });

  const isConfirmed =
    totalPages === 1
      ? bestCount === 1 && bestOffset >= 1
      : bestCount >= Math.max(2, Math.floor(totalPages * 0.45));

  if (!isConfirmed) {
    return { hasExisting: false, pageMap };
  }

  for (let i = 0; i < totalPages; i++) {
    const expected = i + bestOffset;
    const pageCandidates = candidatesPerPage.get(i);
    if (pageCandidates && pageCandidates.has(expected)) {
      pageMap.set(i, expected);
    } else {
      pageMap.set(i, Math.max(1, expected));
    }
  }

  return { hasExisting: true, pageMap };
}

/**
 * Đóng dấu số trang tự động (bắt đầu từ 1) vào vị trí Chính giữa chân trang (Footer - Center)
 * cho tệp PDF chưa có sẵn số trang, giữ nguyên 100% nội dung và con dấu gốc.
 */
async function stampCenterFooterPageNumbersOnPdf(
  originalBytes: ArrayBuffer
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
  const { regular } = await embedVietnameseSerifFonts(pdfDoc);
  const pages = pdfDoc.getPages();

  pages.forEach((page, idx) => {
    const pageNumStr = String(idx + 1);
    const { width } = page.getSize();
    const textW = regular.widthOfTextAtSize(pageNumStr, 11);
    page.drawText(pageNumStr, {
      x: (width - textW) / 2,
      y: 26, // Chính giữa chân trang
      size: 11,
      font: regular,
      color: rgb(0, 0, 0),
    });
  });

  return pdfDoc.save();
}

/**
 * Gộp `[Mục Lục] <Base_Name>.pdf` lên trước trang đầu tiên của PDF nội dung gốc.
 * Bảo toàn 100% chất lượng vector, hình ảnh, chữ ký và con dấu đỏ.
 */
async function mergeTocAndContentPdfs(
  tocPdfBytes: Uint8Array,
  contentPdfBytes: Uint8Array | ArrayBuffer
): Promise<{ mergedBytes: Uint8Array; totalPages: number }> {
  const mergedDoc = await PDFDocument.create();
  const tocDoc = await PDFDocument.load(tocPdfBytes);
  const contentDoc = await PDFDocument.load(contentPdfBytes, { ignoreEncryption: true });

  const tocPages = await mergedDoc.copyPages(tocDoc, tocDoc.getPageIndices());
  tocPages.forEach((p) => mergedDoc.addPage(p));

  const contentPages = await mergedDoc.copyPages(contentDoc, contentDoc.getPageIndices());
  contentPages.forEach((p) => mergedDoc.addPage(p));

  const mergedBytes = await mergedDoc.save();
  return {
    mergedBytes,
    totalPages: mergedDoc.getPageCount(),
  };
}

/**
 * Xử lý trọn vẹn LUỒNG B (Đầu vào là <Base_Name>.pdf):
 * 1. Quét vùng Header/Footer kiểm tra số trang hiện trạng (giữ nguyên nếu đã có, đánh số từ 1 ở giữa Footer nếu chưa có).
 * 2. Trích xuất Mục lục 2 lớp (Bookmarks -> Font Bold/Size + Regex VI/EN + Ghép dòng tiêu đề).
 * 3. Tạo `[Mục Lục] <Base_Name>.docx` (Tab Leader chấm bi, không đánh số trang).
 * 4. Tạo `[Mục Lục] <Base_Name>.pdf`.
 * 5. Gộp lên đầu PDF gốc -> `<Base_Name> (in ấn).pdf`.
 */
export async function processPdfDocument(
  file: File,
  onProgress?: (stepLabel: string, progress: number) => void
): Promise<PdfProcessResult> {
  const baseName = getBaseName(file.name);
  onProgress?.('Đang đọc cấu trúc & tọa độ văn bản PDF...', 15);

  const originalBuffer = await file.arrayBuffer();
  const pdfTask = pdfjsLib.getDocument({ data: originalBuffer.slice(0) });
  const pdf = await pdfTask.promise;
  const numPages = pdf.numPages;

  const pagesTokens: { pageHeight: number; tokens: RawPdfTextToken[] }[] = [];
  const allFontSizes: number[] = [];
  const pagesTextForLlm: { pageNumber: number; text: string }[] = [];

  for (let p = 1; p <= numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent();
    const styles = textContent.styles || {};

    const tokens: RawPdfTextToken[] = [];

    for (const item of textContent.items) {
      if (!('str' in item)) continue;
      const str = item.str;
      if (!str || !str.trim()) continue;

      const tx = item.transform;
      const x = tx[4];
      const y = tx[5];
      const fontSize = Math.max(6, Math.round(Math.hypot(tx[0], tx[1]) * 10) / 10);

      const fontName = (item.fontName || '').toLowerCase();
      const styleObj = styles[item.fontName];
      const fontFamily = (styleObj?.fontFamily || '').toLowerCase();
      const isBold =
        fontName.includes('bold') ||
        fontName.includes('bd') ||
        fontName.includes('black') ||
        fontName.includes('heavy') ||
        fontName.includes('demi') ||
        fontFamily.includes('bold');

      tokens.push({ str, x, y, fontSize, isBold });
      allFontSizes.push(fontSize);
    }

    pagesTokens.push({
      pageHeight: viewport.height,
      tokens,
    });

    pagesTextForLlm.push({
      pageNumber: p,
      text: tokens.map((t) => t.str).join(' '),
    });
  }

  // Trích xuất các dòng ở các trang đầu để phục vụ thuật toán nhận diện Tên văn bản chính thức (LUẬT, NGHỊ ĐỊNH...)
  const firstPagesCandidateLines: { text: string; isBold?: boolean }[] = [];
  pagesTokens.slice(0, 2).forEach(({ tokens }) => {
    const sorted = [...tokens].sort((a, b) => {
      if (Math.abs(b.y - a.y) > 3.5) return b.y - a.y;
      return a.x - b.x;
    });
    const visualLines: RawPdfTextToken[][] = [];
    for (const tk of sorted) {
      const lastLine = visualLines[visualLines.length - 1];
      if (lastLine && Math.abs(lastLine[0].y - tk.y) <= 3.5) {
        lastLine.push(tk);
      } else {
        visualLines.push([tk]);
      }
    }
    for (const lt of visualLines) {
      lt.sort((a, b) => a.x - b.x);
      const str = cleanHeadingText(lt.map((t) => t.str).join(' '));
      if (str) {
        const isBold = lt.some((t) => t.isBold);
        firstPagesCandidateLines.push({ text: str, isBold });
      }
    }
  });
  const rawLocalTitle = extractOfficialDocumentTitle(firstPagesCandidateLines);
  const localOfficialTitle = ensureDocumentTypePrefix(rawLocalTitle || '', firstPagesCandidateLines);

  // Kiểm tra xem đây có phải là PDF scan dạng ảnh (image-based) không:
  // Lọc bỏ con dấu chữ ký số điện tử (Văn phòng Chính phủ, Ban cơ yếu, chữ ký số VGP...)
  // Nếu nội dung thực sự của 3 trang đầu < 350 ký tự hoặc trung bình < 150 ký tự/trang -> Xác định là PDF Scan
  const cleanTokensText = pagesTokens
    .slice(0, 3)
    .flatMap((p) => p.tokens)
    .map((t) => t.str.trim())
    .filter(
      (str) =>
        !/^(?:ký bởi|người ký|thời gian ký|cơ quan|cổng thông tin điện tử|email|chữ ký số|digitally signed|signature)/iu.test(
          str
        )
    )
    .join('');

  const first3PagesChars = pagesTokens
    .slice(0, 3)
    .reduce((acc, p) => acc + p.tokens.reduce((sum, t) => sum + t.str.trim().length, 0), 0);

  const isScannedPdf =
    cleanTokensText.length < 350 || first3PagesChars / Math.min(numPages, 3) < 150;

  let smartBaseName = baseName;
  let headings: HeadingItem[] = [];
  let hasExisting = false;
  let pageMap = new Map<number, number>();
  let usedLlm = false;

  // THỬ NGHIỆM 1: Nhận diện Mục Lục thông minh bằng Gemini LLM API nếu đã cấu hình Key
  if (isScannedPdf) {
    if (hasGeminiApiKey()) {
      onProgress?.('Phát hiện PDF scan dạng ảnh: Đang nhận diện nội dung văn bản...', 35);
      try {
        const scanResult = await extractTocFromScannedPdfWithGemini(originalBuffer, file.name);
        if (scanResult && (scanResult.toc_items?.length > 0 || isValidDocumentTitle(scanResult.document_title))) {
          usedLlm = true;
          hasExisting = Boolean(scanResult.has_existing_page_numbers);
          const rawTitle = isValidDocumentTitle(scanResult.document_title)
            ? scanResult.document_title
            : '';
          const chosenTitle = ensureDocumentTypePrefix(rawTitle, file.name);
          smartBaseName = formatSmartBaseName(baseName, chosenTitle);
          headings = (scanResult.toc_items || []).map((it, idx) => ({
            id: `scan-h-${idx + 1}-${it.page}`,
            level: it.level,
            title: it.title,
            pageNumber: it.page,
          }));
          for (let i = 0; i < numPages; i++) {
            pageMap.set(i, i + 1);
          }
        }
      } catch (e) {
        console.warn('Lỗi khi gọi Gemini Vision API cho PDF scan:', e);
      }
    }
  } else if (hasGeminiApiKey()) {
    onProgress?.('Đang phân tích cấu trúc đề mục tự động...', 35);
    try {
      const llmResult = await extractTocFromPdfWithGemini(pagesTextForLlm, file.name);
      if (llmResult && llmResult.toc_items && llmResult.toc_items.length > 0) {
        usedLlm = true;
        // Bắt buộc document_title phải là Tên văn bản hợp lệ, tuyệt đối không lấy Điều/Chương
        const rawTitle = isValidDocumentTitle(llmResult.document_title)
          ? llmResult.document_title
          : localOfficialTitle;
        const chosenTitle = ensureDocumentTypePrefix(rawTitle, firstPagesCandidateLines);
        smartBaseName = formatSmartBaseName(baseName, chosenTitle);
        hasExisting = Boolean(llmResult.has_existing_page_numbers);
        headings = llmResult.toc_items.map((it, idx) => ({
          id: `llm-h-${idx + 1}-${it.page}`,
          level: it.level,
          title: it.title,
          pageNumber: it.page,
        }));
        for (let i = 0; i < numPages; i++) {
          pageMap.set(i, i + 1);
        }
      }
    } catch (e) {
      console.warn('Fallback về bộ lọc Regex nội bộ do lỗi LLM:', e);
    }
  }

  // THỬ NGHIỆM 2: Nếu không dùng LLM hoặc LLM không trả về mục lục
  if (!usedLlm) {
    if (isScannedPdf) {
      // PDF scan mà không dùng được LLM Vision (không có API key hoặc mạng lỗi):
      // Không có text layer để bóc tách bằng regex, giữ tên file và danh sách đề mục rỗng
      hasExisting = false;
      smartBaseName = baseName;
      headings = [];
    } else {
      onProgress?.('Đang kiểm tra số trang vùng Header / Footer (Cục bộ)...', 40);
      const detectRes = detectExistingPageNumbersFromTokens(pagesTokens);
      hasExisting = detectRes.hasExisting;
      pageMap = detectRes.pageMap;

      onProgress?.('Đang trích xuất đề mục & ghép dòng tiêu đề thông minh (VI/EN)...', 65);

      const candidateBlocks: CandidateBlock[] = [];
      let runningParagraphIdx = 0;

      pagesTokens.forEach(({ pageHeight, tokens }, pageIdx) => {
        const displayedPageNum = pageMap.get(pageIdx) ?? pageIdx + 1;
        const footerLimitY = pageHeight * FOOTER_RATIO;
        const headerStartY = pageHeight * (1 - HEADER_RATIO);

        const sorted = [...tokens].sort((a, b) => {
          if (Math.abs(b.y - a.y) > 3.5) return b.y - a.y;
          return a.x - b.x;
        });

        const visualLines: RawPdfTextToken[][] = [];
        for (const tk of sorted) {
          const lastLine = visualLines[visualLines.length - 1];
          if (lastLine && Math.abs(lastLine[0].y - tk.y) <= 3.5) {
            lastLine.push(tk);
          } else {
            visualLines.push([tk]);
          }
        }

        for (const lineTokens of visualLines) {
          lineTokens.sort((a, b) => a.x - b.x);
          const rawLineText = cleanHeadingText(lineTokens.map((t) => t.str).join(' '));
          if (!rawLineText) continue;

          const avgY = lineTokens.reduce((acc, t) => acc + t.y, 0) / lineTokens.length;
          const inMargin = avgY <= footerLimitY || avgY >= headerStartY;
          if (inMargin && extractPageNumberFromMarginText(rawLineText) !== null) {
            continue;
          }

          let totalChars = 0;
          let boldChars = 0;
          let maxFontSize = 13.0;

          for (const t of lineTokens) {
            const len = t.str.trim().length;
            totalChars += len;
            if (t.isBold) boldChars += len;
            if (t.fontSize > maxFontSize) maxFontSize = t.fontSize;
          }

          const isLineBold = totalChars > 0 && boldChars / totalChars >= 0.6;

          candidateBlocks.push({
            text: rawLineText,
            isBold: isLineBold,
            fontSize: maxFontSize,
            pageNumber: displayedPageNum,
            paragraphIndex: runningParagraphIdx++,
            styleLevel: null,
          });
        }
      });

      const medianFontSize = getMedian(allFontSizes, 13.0);
      headings = parseHeadingsFromBlocks(candidateBlocks, medianFontSize);

      // Dùng Tên văn bản chính thức đã trích xuất từ đầu tài liệu, TUYỆT ĐỐI không lấy headings[0]
      smartBaseName = formatSmartBaseName(baseName, localOfficialTitle);
    }
  }

  let workingContentPdfBytes: Uint8Array | ArrayBuffer = originalBuffer;
  if (!hasExisting) {
    onProgress?.('PDF chưa có số trang: Đang đánh số trang tự động vào giữa Footer...', 75);
    workingContentPdfBytes = await stampCenterFooterPageNumbersOnPdf(originalBuffer);
    for (let i = 0; i < numPages; i++) {
      pageMap.set(i, i + 1);
    }
  }

  onProgress?.('Đang khởi tạo [Mục Lục].docx, [Mục Lục].pdf & gộp bản in ấn...', 85);

  const outputs = await buildPdfFlowOutputs(
    smartBaseName,
    headings,
    workingContentPdfBytes
  );

  onProgress?.('Hoàn tất!', 100);

  return {
    baseName: smartBaseName,
    headings,
    hadExistingPageNumbers: hasExisting,
    totalPages: numPages,
    outputs,
    workingContentPdfBytes,
  };
}

/**
 * Tạo đủ 3 tệp đầu ra bắt buộc của Luồng B:
 * 1. `[Mục Lục] <Base_Name>.docx`
 * 2. `[Mục Lục] <Base_Name>.pdf`
 * 3. `<Base_Name> (in ấn).pdf`
 */
export async function buildPdfFlowOutputs(
  baseName: string,
  headings: HeadingItem[],
  workingContentPdfBytes: Uint8Array | ArrayBuffer
): Promise<OutputFileItem[]> {
  // 1. Tạo [Mục Lục] <Base_Name>.docx (Tab Leader chấm bi, không đánh số trang)
  const tocDocxBlob = await buildStandaloneTocDocx(baseName, headings);

  // 2. Tạo [Mục Lục] <Base_Name>.pdf
  const tocPdfBytes = await renderStandaloneTocPdf(baseName, headings);
  const tocPdfBlob = new Blob([tocPdfBytes as unknown as BlobPart], {
    type: 'application/pdf',
  });

  // 3. Gộp [Mục Lục] <Base_Name>.pdf lên đầu PDF nội dung gốc -> <Base_Name> (in ấn).pdf
  const { mergedBytes } = await mergeTocAndContentPdfs(tocPdfBytes, workingContentPdfBytes);
  const mergedPdfBlob = new Blob([mergedBytes as unknown as BlobPart], {
    type: 'application/pdf',
  });

  return [
    {
      name: `[Mục Lục] ${baseName}.docx`,
      blob: tocDocxBlob,
      url: URL.createObjectURL(tocDocxBlob),
      kind: 'docx',
      description: 'Tệp Word mục lục rời (chuẩn Tab Leader chấm bi, dễ chỉnh sửa thủ công)',
    },
    {
      name: `[Mục Lục] ${baseName}.pdf`,
      blob: tocPdfBlob,
      url: URL.createObjectURL(tocPdfBlob),
      kind: 'pdf',
      description: 'Tệp PDF mục lục rời',
    },
    {
      name: `${baseName} (in ấn).pdf`,
      blob: mergedPdfBlob,
      url: URL.createObjectURL(mergedPdfBlob),
      kind: 'pdf',
      description: 'Tệp PDF gộp hoàn chỉnh (Mục lục ở đầu + Nội dung gốc giữ nguyên con dấu)',
    },
  ];
}
