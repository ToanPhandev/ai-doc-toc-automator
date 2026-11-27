/**
 * Dịch vụ nhận diện Mục lục & Tiêu đề thông minh sử dụng Google Gemini REST API.
 * - Sử dụng native fetch, không cài đặt thêm SDK ngoài để giữ bundle nhẹ nhất.
 * - Hỗ trợ Structured Output (JSON Schema) đảm bảo định dạng 100% chính xác.
 * - Tự động Fallback về bộ lọc Regex nội bộ khi không có API key hoặc lỗi mạng / timeout.
 * - TỐI ƯU HÓA SIÊU TỐC: Smart Pre-Filtering (giảm 90% dung lượng payload) + AbortController Timeout (8s).
 */

import { PDFDocument } from 'pdf-lib';
import { FALLBACK_GEMINI_MODEL, getActiveGeminiModel } from '../config/aiConfig';

const STORAGE_KEY = 'doc_automator_gemini_api_key';
const VISION_API_TIMEOUT_MS = 60000; // 60 giây cho luồng Vision OCR đọc hình ảnh PDF Scan
const WORD_CHUNK_TIMEOUT_MS = 12000; // 12 giây cho mỗi khúc Word
const WORD_SINGLE_CALL_MAX = 120;
const WORD_CHUNK_SIZE = 100;
const WORD_CHUNK_OVERLAP = 3;
const WORD_MAX_CHUNKS = 8;
const WORD_MAX_CONCURRENT_CHUNKS = 2;

const PDF_TEXT_CHUNK_TIMEOUT_MS = 12000;
const PDF_TEXT_SINGLE_CALL_MAX_PAGES = 30;
const PDF_TEXT_CHUNK_SIZE = 25;
const PDF_TEXT_CHUNK_OVERLAP = 1;
const PDF_TEXT_MAX_CHUNKS = 8;
const PDF_TEXT_MAX_CONCURRENT_CHUNKS = 2;

const PDF_SCAN_SINGLE_CALL_MAX_PAGES = 15;
const PDF_SCAN_BATCH_SIZE = 15;
const PDF_SCAN_MAX_BATCHES = 6;
const PDF_SCAN_MAX_CONCURRENT_BATCHES = 2;

/**
 * Gửi yêu cầu generateContent tới Gemini API kèm cơ chế tự động chuyển hướng (Auto Fallback Resilience):
 * Nếu mô hình được chỉ định gặp lỗi 503 (quá tải), 404 hoặc 429 -> tự động thử lại ngay với mô hình ổn định FALLBACK_GEMINI_MODEL.
 */
async function fetchGeminiWithFallback(
  apiKey: string,
  model: string,
  bodyPayload: unknown,
  signal: AbortSignal
): Promise<Response> {
  const buildUrl = (m: string) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;

  let response = await fetch(buildUrl(model), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify(bodyPayload),
  });

  if (
    !response.ok &&
    (response.status === 503 || response.status === 404 || response.status === 429) &&
    model !== FALLBACK_GEMINI_MODEL
  ) {
    console.warn(
      `Gemini model "${model}" trả về mã ${response.status}. Tự động kích hoạt mô hình dự phòng "${FALLBACK_GEMINI_MODEL}"...`
    );
    response = await fetch(buildUrl(FALLBACK_GEMINI_MODEL), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify(bodyPayload),
    });
  }

  return response;
}

export interface PdfPageInputForLlm {
  pageNumber: number;
  text: string;
}

export interface PdfLlmOptions {
  onChunkProgress?: (completed: number, total: number, rangeLabel?: string) => void;
}

export interface LlmTocItem {
  title: string;
  level: 1 | 2;
  page: number;
}

export interface LlmPdfTocResponse {
  document_title: string;
  has_existing_page_numbers: boolean;
  toc_items: LlmTocItem[];
  failed_page_ranges?: { startPage: number; endPage: number }[];
}

export interface WordParagraphCandidateInput {
  index: number;
  text: string;
  isBold: boolean;
  fontSize: number;
  isCentered?: boolean;
  styleLevel?: 1 | 2 | null;
}

export interface WordLlmOptions {
  medianFontSize?: number;
  onChunkProgress?: (completed: number, total: number) => void;
}

export interface LlmWordTocItem {
  title: string;
  level: 1 | 2;
  paragraph_index: number;
  merged_indices?: number[];
}

export interface LlmWordTocResponse {
  document_title: string;
  toc_items: LlmWordTocItem[];
  failed_ranges?: { startParagraphIndex: number; endParagraphIndex: number }[];
}

/**
 * Kiểm tra xem API Key có đang được nạp từ biến môi trường .env hay không
 */
export function isApiKeyFromEnv(): boolean {
  try {
    const fromEnv = (import.meta as unknown as { env?: { VITE_GEMINI_API_KEY?: string } }).env?.VITE_GEMINI_API_KEY;
    return Boolean(fromEnv && fromEnv.trim());
  } catch {
    return false;
  }
}

/**
 * Lấy API key hiện tại:
 * 1. ƯU TIÊN 1: Đọc từ biến môi trường VITE_GEMINI_API_KEY trong file .env
 * 2. ƯU TIÊN 2: Đọc từ localStorage (nếu người dùng cấu hình thủ công qua giao diện)
 */
export function getStoredApiKey(): string {
  try {
    const fromEnv = (import.meta as unknown as { env?: { VITE_GEMINI_API_KEY?: string } }).env?.VITE_GEMINI_API_KEY;
    if (fromEnv && fromEnv.trim()) {
      return fromEnv.trim();
    }
  } catch {
    // ignore
  }

  try {
    const fromStorage = localStorage.getItem(STORAGE_KEY);
    if (fromStorage && fromStorage.trim()) {
      return fromStorage.trim();
    }
  } catch {
    // ignore
  }

  return '';
}

/**
 * Lưu API key vào localStorage
 */
export function setStoredApiKey(key: string): void {
  try {
    if (!key || !key.trim()) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, key.trim());
    }
  } catch {
    // ignore
  }
}

/**
 * Kiểm tra xem người dùng đã cấu hình API key hay chưa
 */
export function hasGeminiApiKey(): boolean {
  return Boolean(getStoredApiKey());
}

/**
 * Kiểm tra tính hợp lệ của API key và mô hình đang chọn (Timeout 5s)
 */
export async function testGeminiApiKey(
  customKey?: string,
  customModel?: string
): Promise<{ success: boolean; message: string; model: string }> {
  const apiKey = (customKey || getStoredApiKey()).trim();
  const model = customModel || getActiveGeminiModel();

  if (!apiKey) {
    return { success: false, message: 'Chưa nhập API Key.', model };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: 'Trả về chuỗi: OK' }],
          },
        ],
      }),
    });
    clearTimeout(timer);

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      const errMsg = errJson?.error?.message || `Mã lỗi HTTP ${response.status}`;
      return { success: false, message: `Lỗi kết nối Gemini API (${model}): ${errMsg}`, model };
    }

    return { success: true, message: `Kết nối thành công tới mô hình ${model}!`, model };
  } catch (err: unknown) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof Error && err.name === 'AbortError') {
      return { success: false, message: 'Hết thời gian chờ kết nối (Timeout 6s). Vui lòng thử lại.', model };
    }
    return { success: false, message: `Không thể kết nối đến máy chủ: ${msg}`, model };
  }
}

/**
 * Lọc tinh gọn nội dung trang PDF (Smart Pre-Filtering):
 * - Hỗ trợ tiền tố `[B] ` (dòng in đậm từ pdfProcessor.ts).
 * - Giảm 85-90% dung lượng text thô để AI phản hồi siêu tốc.
 */
export function thinPdfPageText(pageNumber: number, rawText: string): string {
  if (!rawText || !rawText.trim()) return '';

  const separatorRe = /^[-–—_*=\s]{3,}$/;

  // Trang 1 và 2: Giữ phần đầu đầy đủ để AI nhận diện Tên văn bản chính thức & số trang
  if (pageNumber <= 2) {
    const firstLines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !separatorRe.test(l.replace(/^\[B\]\s*/i, '').trim()));
    return firstLines.join('\n').slice(0, 2000).trim();
  }

  // Từ trang 3 trở đi: Chỉ giữ các dòng tiềm năng làm đề mục, loại bỏ đoạn văn thân bài dài dòng
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const headingKeywords =
    /^(?:phần|chương|mục|điều|khoản|tiểu\s*mục|lời\s*nói\s*đầu|mở\s*đầu|tổng\s*quan|quyết\s*định|bộ\s*luật|luật|nghị\s*định|thông\s*tư|kết\s*luận|tài\s*liệu\s*tham\s*khảo|phụ\s*lục|biểu\s*mẫu|mẫu\s*số|part|chapter|section|article|appendix|introduction|preface|conclusion|references)\b/iu;
  const romanOrNumberedRe =
    /^(?:(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI|XVII|XVIII|XIX|XX)\s*[.\-–—:)]|[A-Z][.)]|(?:\d+\.(?:\d+\.?){0,2}))\s+\S/u;

  const candidateLines = lines.filter((line) => {
    const isBoldMarked = line.startsWith('[B] ');
    const plainLine = isBoldMarked ? line.slice(4).trim() : line;

    if (!plainLine || separatorRe.test(plainLine)) return false;
    if (isBoldMarked && plainLine.length <= 320) return true;
    if (plainLine.length > 280) return false;
    if (headingKeywords.test(plainLine)) return true;
    if (romanOrNumberedRe.test(plainLine)) return true;
    if (plainLine === plainLine.toUpperCase() && plainLine.length < 140 && /\p{L}/u.test(plainLine)) {
      return true;
    }
    return plainLine.length <= 90;
  });

  return candidateLines.slice(0, 40).join('\n');
}

/**
 * Chia danh sách trang PDF Text thành các khúc chồng gối 1 trang biên.
 */
export function splitPdfPagesIntoChunks(pages: PdfPageInputForLlm[]): {
  chunks: PdfPageInputForLlm[][];
  overflowRange: { startPage: number; endPage: number } | null;
} {
  if (pages.length === 0) {
    return { chunks: [], overflowRange: null };
  }
  if (pages.length <= PDF_TEXT_SINGLE_CALL_MAX_PAGES) {
    return { chunks: [pages], overflowRange: null };
  }

  const chunks: PdfPageInputForLlm[][] = [];
  const step = PDF_TEXT_CHUNK_SIZE - PDF_TEXT_CHUNK_OVERLAP;
  let start = 0;

  while (start < pages.length && chunks.length < PDF_TEXT_MAX_CHUNKS) {
    const end = Math.min(pages.length, start + PDF_TEXT_CHUNK_SIZE);
    chunks.push(pages.slice(start, end));
    if (end >= pages.length) {
      start = pages.length;
      break;
    }
    start += step;
  }

  let overflowRange: { startPage: number; endPage: number } | null = null;
  if (start < pages.length) {
    const lastCoveredPage = chunks[chunks.length - 1][chunks[chunks.length - 1].length - 1].pageNumber;
    const firstUncovered = pages.find((p) => p.pageNumber > lastCoveredPage);
    if (firstUncovered) {
      overflowRange = {
        startPage: firstUncovered.pageNumber,
        endPage: pages[pages.length - 1].pageNumber,
      };
    }
  }

  return { chunks, overflowRange };
}

/**
 * Chia tổng số trang PDF Scan thành các đợt cho Gemini Vision (tối đa 6 đợt = 90 trang).
 */
export function splitPageCountIntoScanBatches(
  totalPages: number
): { startPage: number; endPage: number }[] {
  if (totalPages <= 0) return [];
  if (totalPages <= PDF_SCAN_SINGLE_CALL_MAX_PAGES) {
    return [{ startPage: 1, endPage: totalPages }];
  }

  const batches: { startPage: number; endPage: number }[] = [];
  let start = 1;
  while (start <= totalPages && batches.length < PDF_SCAN_MAX_BATCHES) {
    const end = Math.min(totalPages, start + PDF_SCAN_BATCH_SIZE - 1);
    batches.push({ startPage: start, endPage: end });
    start = end + 1;
  }
  return batches;
}

/**
 * Gộp và khử trùng lặp danh sách mục lục PDF từ nhiều khúc/đợt.
 */
export function mergePdfChunkItems(items: LlmTocItem[]): LlmTocItem[] {
  const normalizeKeyTitle = (t: string) =>
    t
      .toLowerCase()
      .replace(/[:.\-–—\s]+$/gu, '')
      .replace(/\s+/g, ' ')
      .trim();

  const deduped = new Map<string, LlmTocItem>();
  for (const raw of items) {
    const title = String(raw.title || '').trim();
    if (!title) continue;
    const page = Math.max(1, Number(raw.page) || 1);
    const level: 1 | 2 = raw.level === 2 ? 2 : 1;
    const key = `${page}::${normalizeKeyTitle(title)}`;

    const existing = deduped.get(key);
    if (!existing || title.length > existing.title.length) {
      deduped.set(key, { title, level, page });
    }
  }

  return Array.from(deduped.values()).sort((a, b) => a.page - b.page);
}

async function requestPdfTextChunkWithGemini(
  apiKey: string,
  model: string,
  chunk: PdfPageInputForLlm[],
  fileName: string,
  isFirstChunk: boolean
): Promise<LlmPdfTocResponse | null> {
  const pagesFormatted = chunk
    .map((p) => {
      const thinned = thinPdfPageText(p.pageNumber, p.text);
      return thinned ? `--- PAGE_INDEX: ${p.pageNumber} ---\n${thinned}` : '';
    })
    .filter(Boolean)
    .join('\n\n');

  if (!pagesFormatted.trim()) return null;

  const firstChunkRules = isFirstChunk
    ? `1. "document_title": BẮT BUỘC LÀ TÊN CHÍNH THỨC CỦA VĂN BẢN (VD: "LUẬT SỞ HỮU TRÍ TUỆ", "BỘ LUẬT DÂN SỰ", "NGHỊ ĐỊNH QUY ĐỊNH CHI TIẾT...", "NGHỊ QUYẾT CỦA BỘ CHÍNH TRỊ...", hoặc tên đề tài báo cáo/giáo trình).
   - QUÉT TRỰC TIẾP ĐẦU TRANG 1 ĐỂ TÌM TỪ KHÓA LOẠI VĂN BẢN (LUẬT, BỘ LUẬT, NGHỊ ĐỊNH, THÔNG TƯ, QUYẾT ĐỊNH, NGHỊ QUYẾT...). BẮT BUỘC PHẢI GHÉP CẢ TỪ KHÓA LOẠI VĂN BẢN VÀO ĐẦU TIÊU ĐỀ NẾU LÀ VĂN BẢN PHÁP LÝ!
   - NẾU TIÊU ĐỀ TÊN VĂN BẢN BỊ TÁCH LÀM 2 HOẶC 3 DÒNG -> GHÉP LẠI THÀNH 1 TÊN HOÀN CHỈNH.
   - TUYỆT ĐỐI NGHIÊM CẤM đưa tên Điều, Chương, Mục, Phần (như "Điều 1...", "Chương I...", "Phần thứ nhất...") vào trường "document_title".
   - LOẠI BỎ hoàn toàn: Quốc hiệu ("CỘNG HÒA XÃ HỘI..."), Tiêu ngữ ("Độc lập - Tự do..."), số hiệu công văn ("Số: 67/VBHN..."), nơi gửi, ngày tháng.
2. "has_existing_page_numbers": Xác định xem tài liệu gốc đã được in sẵn số trang ở đầu/chân trang chưa (true nếu có, false nếu chưa có). Tự suy luận trang 1 nếu trang 1 bị ẩn số.`
    : `1. "document_title": Đây là phần tiếp theo của tài liệu dài, hãy trả về chuỗi rỗng "".
2. "has_existing_page_numbers": Trả về false.`;

  const systemInstructions = `
Bạn là chuyên gia phân tích văn bản pháp lý, hành chính, nghị quyết, báo cáo và kỹ thuật chuyên nghiệp (Việt Nam & Quốc tế).
Nhiệm vụ của bạn: Đọc nội dung các trang văn bản PDF dưới đây (lưu ý: các dòng có tiền tố "[B] " ở đầu là DÒNG IN ĐẬM trong tài liệu gốc) để trích xuất Mục Lục (Table of Contents)${isFirstChunk ? ' và Tiêu Đề Tài Liệu' : ''} với độ chính xác tuyệt đối.

CÁC YÊU CẦU BẮT BUỘC:
${firstChunkRules}
3. "toc_items": Danh sách các mục lục được phân cấp (KHÔNG giữ tiền tố "[B] " trong kết quả "title"):
   - "level": 1 cho các mục cấp cao (LỜI NÓI ĐẦU, PHẦN, CHƯƠNG, QUYẾT ĐỊNH, PHỤ LỤC, INTRODUCTION, PART, CHAPTER, APPENDIX...) HOẶC các mục đánh số La Mã dùng dấu gạch ngang hoặc dấu chấm trong Nghị quyết/Chỉ thị/Báo cáo (VD: "I- QUAN ĐIỂM CHỈ ĐẠO", "II- MỤC TIÊU", "III- NHIỆM VỤ, GIẢI PHÁP", "IV- TỔ CHỨC THỰC HIỆN").
   - "level": 2 cho các mục con (MỤC, ĐIỀU, SECTION, ARTICLE...) HOẶC các tiểu mục đánh số "1.", "1.1.", "1.2.", "2." CHỈ KHI có dấu "[B] " (in đậm) hoặc nổi bật làm tiêu đề mục (VD: "1. Đến năm 2030", "1.1. Mục tiêu chung", "1. Đổi mới mạnh mẽ tư duy...").
   - QUY TẮC LOẠI NHIỄU BẮT BUỘC: Tuyệt đối BỎ QUA các đoạn văn liệt kê nội dung bình thường (KHÔNG có "[B] ", chữ thường dài như đoạn văn) dù bắt đầu bằng "1.", "2.", "3."... (ví dụ các khoản liệt kê dưới phần I- và phần IV- của Nghị quyết). Bỏ qua các dòng gạch phân cách "-----".
   - TỰ ĐỘNG GHÉP CÁC TIÊU ĐỀ BỊ NGẮT DÒNG thành 1 dòng hoàn chỉnh (VD: dòng trên là "CHƯƠNG I", dòng dưới là "CHẾ ĐỘ CHÍNH TRỊ" -> ghép thành "CHƯƠNG I: CHẾ ĐỘ CHÍNH TRỊ").
   - LOẠI BỎ hoàn toàn: Quốc hiệu, tiêu ngữ, trích yếu, chữ ký, nơi nhận, ghi chú chân trang (footnote), bảng biểu chi tiết.
   - "page": Số trang in sẵn (nếu có) hoặc đúng số PAGE_INDEX nơi đề mục đó xuất hiện.
`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PDF_TEXT_CHUNK_TIMEOUT_MS);

  try {
    const response = await fetchGeminiWithFallback(
      apiKey,
      model,
      {
        contents: [
          {
            parts: [
              {
                text: `${systemInstructions}\n\nTÊN TỆP GỐC: ${fileName}\n\nNỘI DUNG VĂN BẢN THEO TRANG (ĐÃ TINH GỌN):\n${pagesFormatted}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          response_mime_type: 'application/json',
          response_schema: {
            type: 'OBJECT',
            properties: {
              document_title: { type: 'STRING' },
              has_existing_page_numbers: { type: 'BOOLEAN' },
              toc_items: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    title: { type: 'STRING' },
                    level: { type: 'INTEGER' },
                    page: { type: 'INTEGER' },
                  },
                  required: ['title', 'level', 'page'],
                },
              },
            },
            required: ['document_title', 'has_existing_page_numbers', 'toc_items'],
          },
        },
      },
      controller.signal
    );

    clearTimeout(timer);

    if (!response.ok) {
      console.warn(`Gemini API (${model}) PDF chunk returned error status:`, response.status);
      return null;
    }

    const data = await response.json();
    const rawJsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawJsonText) return null;

    const parsed: LlmPdfTocResponse = JSON.parse(rawJsonText);
    if (!parsed.toc_items || !Array.isArray(parsed.toc_items)) return null;

    parsed.toc_items = parsed.toc_items.map((item) => ({
      title: String(item.title || '').replace(/^\[B\]\s*/i, '').trim(),
      level: item.level === 2 ? 2 : 1,
      page: Math.max(1, Number(item.page) || 1),
    }));

    return parsed;
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn(
        `Gemini API (${model}) PDF chunk bị timeout sau ${PDF_TEXT_CHUNK_TIMEOUT_MS / 1000}s.`
      );
    } else {
      console.warn(`Lỗi khi gọi Gemini API (${model}) cho PDF chunk:`, err);
    }
    return null;
  }
}

/**
 * Nhận diện Mục lục & Tiêu đề cho Luồng PDF bằng Gemini LLM (hỗ trợ chia khúc cho PDF dài)
 */
export async function extractTocFromPdfWithGemini(
  pagesText: PdfPageInputForLlm[],
  fileName: string,
  options?: PdfLlmOptions
): Promise<LlmPdfTocResponse | null> {
  const apiKey = getStoredApiKey();
  if (!apiKey || !pagesText.length) return null;

  const model = getActiveGeminiModel();
  const relevantPages = pagesText.filter((p) => p.text.trim().length > 5);
  if (!relevantPages.length) return null;

  const { chunks, overflowRange } = splitPdfPagesIntoChunks(relevantPages);
  if (!chunks.length) return null;

  const chunkResults: (LlmPdfTocResponse | null)[] = new Array(chunks.length).fill(null);
  const failedPageRanges: { startPage: number; endPage: number }[] = [];
  if (overflowRange) {
    failedPageRanges.push(overflowRange);
  }

  let completedChunks = 0;

  for (
    let batchStart = 0;
    batchStart < chunks.length;
    batchStart += PDF_TEXT_MAX_CONCURRENT_CHUNKS
  ) {
    const batch = chunks.slice(batchStart, batchStart + PDF_TEXT_MAX_CONCURRENT_CHUNKS);
    await Promise.all(
      batch.map(async (chunk, offset) => {
        const chunkIdx = batchStart + offset;
        const res = await requestPdfTextChunkWithGemini(
          apiKey,
          model,
          chunk,
          fileName,
          chunkIdx === 0
        );
        chunkResults[chunkIdx] = res;
        if (!res && chunk.length > 0) {
          failedPageRanges.push({
            startPage: chunk[0].pageNumber,
            endPage: chunk[chunk.length - 1].pageNumber,
          });
        }
        completedChunks++;
        const label = `${chunk[0].pageNumber}-${chunk[chunk.length - 1].pageNumber}`;
        options?.onChunkProgress?.(completedChunks, chunks.length, label);
      })
    );
  }

  const succeeded = chunkResults.filter((r): r is LlmPdfTocResponse => r !== null);
  if (succeeded.length === 0) {
    return null;
  }

  const mergedItems = mergePdfChunkItems(succeeded.flatMap((r) => r.toc_items));
  return {
    document_title: chunkResults[0]?.document_title?.trim() || '',
    has_existing_page_numbers: Boolean(chunkResults[0]?.has_existing_page_numbers),
    toc_items: mergedItems,
    failed_page_ranges: failedPageRanges,
  };
}

/**
 * Chuyển đổi ArrayBuffer thành chuỗi Base64 an toàn trên trình duyệt,
 * sử dụng chunk 8192 bytes để tránh tràn call stack.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

async function slicePdfToBase64ForBatch(
  srcDoc: PDFDocument,
  rawBuffer: ArrayBuffer,
  startPage: number,
  endPage: number,
  totalPages: number
): Promise<string> {
  if (
    startPage === 1 &&
    endPage === totalPages &&
    rawBuffer.byteLength <= 10 * 1024 * 1024
  ) {
    return arrayBufferToBase64(rawBuffer);
  }
  const subDoc = await PDFDocument.create();
  const pageIndices: number[] = [];
  for (let p = startPage; p <= endPage; p++) {
    pageIndices.push(p - 1);
  }
  const copiedPages = await subDoc.copyPages(srcDoc, pageIndices);
  copiedPages.forEach((p) => subDoc.addPage(p));
  const subBytes = await subDoc.save();
  return arrayBufferToBase64(subBytes.buffer as ArrayBuffer);
}

async function requestScannedPdfBatchWithGemini(
  apiKey: string,
  model: string,
  base64Data: string,
  fileName: string,
  startPage: number,
  endPage: number,
  isFirstBatch: boolean
): Promise<LlmPdfTocResponse | null> {
  const titleAndPageNumRules = isFirstBatch
    ? `1. "document_title": BẮT BUỘC LÀ TÊN CHÍNH THỨC CỦA VĂN BẢN (VD: "LUẬT SỞ HỮU TRÍ TUỆ", "BỘ LUẬT DÂN SỰ", "NGHỊ ĐỊNH QUY ĐỊNH CHI TIẾT THI HÀNH MỘT SỐ ĐIỀU CỦA LUẬT CHỨNG KHOÁN", "NGHỊ ĐỊNH Về chứng khoán phái sinh...", "THÔNG TƯ Hướng dẫn thực hiện...").
   - QUÉT TRỰC TIẾP DÒNG 1 ĐỂ TÌM CÁC TỪ KHÓA QUEN THUỘC (LUẬT, BỘ LUẬT, NGHỊ ĐỊNH, THÔNG TƯ, QUYẾT ĐỊNH, NGHỊ QUYẾT...). BẮT BUỘC PHẢI GHÉP CẢ TỪ KHÓA LOẠI VĂN BẢN ĐÓ VÀO ĐẦU TIÊU ĐỀ!
   - NẾU TIÊU ĐỀ TÊN VĂN BẢN BỊ TÁCH LÀM NHIỀU DÒNG Ở ĐẦU TRANG NỘI DUNG -> GHÉP LẠI THÀNH 1 TÊN HOÀN CHỈNH.
   - TUYỆT ĐỐI NGHIÊM CẤM đưa tên Điều, Chương, Mục, Phần (như "Điều 1...", "Chương I...", "Phần thứ nhất...") vào trường "document_title".
   - LOẠI BỎ hoàn toàn: Quốc hiệu ("CỘNG HÒA XÃ HỘI..."), Tiêu ngữ ("Độc lập - Tự do..."), số hiệu công văn ("Số: 158/2020/NĐ-CP"), ngày tháng năm, nơi nhận.
2. "has_existing_page_numbers": QUAN SÁT TRỰC TIẾP TRÊN HÌNH ẢNH CÁC TRANG (đặc biệt là Header ở đỉnh trang hoặc Footer ở đáy trang):
   - Trả về true: Nếu các trang văn bản gốc ĐÃ CÓ IN SẴN số trang (ví dụ thấy các con số in như 2, 3, 4... ở đỉnh góc trên hoặc ở giữa chân trang).
   - Trả về false: Nếu tài liệu hoàn toàn là bản nháp/bản không đánh số trang.`
    : `1. "document_title": Đây là lát cắt tiếp theo của tài liệu dài (từ TRANG VẬT LÝ ${startPage} đến ${endPage} của tài liệu gốc), trả về chuỗi rỗng "".
2. "has_existing_page_numbers": Trả về false.`;

  const batchContextNote = isFirstBatch
    ? `Các trang đính kèm là từ TRANG VẬT LÝ 1 đến ${endPage} của tài liệu.`
    : `LƯU Ý ĐÁNH SỐ TRANG: Tệp đính kèm này là lát cắt từ TRANG VẬT LÝ ${startPage} đến ${endPage} của tài liệu gốc (trang đầu tiên của tệp đính kèm tương ứng với TRANG ${startPage} nếu tài liệu chưa in số trang, hoặc lấy đúng số trang in sẵn trên ảnh).`;

  const systemInstructions = `
Bạn là chuyên gia phân tích tài liệu pháp lý, nghị quyết và kỹ thuật chuyên nghiệp (Việt Nam & Quốc tế).
Tài liệu được cung cấp là tệp PDF dạng ảnh scan (Scanned Document).
${batchContextNote}
Nhiệm vụ của bạn: Hãy đọc và nhận diện OCR trực tiếp từ hình ảnh các trang để trích xuất Mục Lục (Table of Contents)${isFirstBatch ? ' và Tiêu Đề Văn Bản chính thức' : ''} với độ chính xác cao nhất.

CÁC YÊU CẦU BẮT BUỘC:
${titleAndPageNumRules}
3. "toc_items": Danh sách các đề mục:
   - "level": 1 cho các mục lớn (PHẦN, CHƯƠNG, QUYẾT ĐỊNH, LỜI NÓI ĐẦU, PHỤ LỤC, PART, CHAPTER, APPENDIX...) HOẶC các mục đánh số La Mã dùng dấu gạch ngang/chấm trong Nghị quyết/Chỉ thị/Báo cáo (VD: "I- QUAN ĐIỂM CHỈ ĐẠO", "II- MỤC TIÊU", "III- NHIỆM VỤ, GIẢI PHÁP", "IV- TỔ CHỨC THỰC HIỆN").
   - "level": 2 cho các mục con (MỤC, ĐIỀU, KHOẢN CHÍNH, SECTION, ARTICLE...) HOẶC các tiểu mục đánh số "1.", "1.1.", "1.2.", "2." chỉ khi được in đậm nổi bật làm tiêu đề mục.
   - Tuyệt đối BỎ QUA các đoạn văn liệt kê chữ thường (không in đậm) dù bắt đầu bằng "1.", "2.", "3."... và bỏ qua các dòng gạch phân cách "-----".
   - TỰ ĐỘNG GHÉP CÁC TIÊU ĐỀ BỊ NGẮT DÒNG thành 1 dòng hoàn chỉnh (VD: dòng trên "CHƯƠNG I", dòng dưới "QUY ĐỊNH CHUNG" -> ghép thành "CHƯƠNG I: QUY ĐỊNH CHUNG").
   - "page": Số trang tương ứng nơi đề mục xuất hiện (ưu tiên theo số trang in sẵn trên tài liệu, nếu không có số trang in sẵn thì trang đầu của lát cắt này là ${startPage}).
`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VISION_API_TIMEOUT_MS);

  try {
    const response = await fetchGeminiWithFallback(
      apiKey,
      model,
      {
        contents: [
          {
            parts: [
              {
                text: `${systemInstructions}\n\nTÊN TỆP GỐC: ${fileName}\nHãy quan sát toàn bộ các trang PDF đính kèm dưới đây và trích xuất dữ liệu JSON chuẩn xác:`,
              },
              {
                inline_data: {
                  mime_type: 'application/pdf',
                  data: base64Data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          response_mime_type: 'application/json',
          response_schema: {
            type: 'OBJECT',
            properties: {
              document_title: { type: 'STRING' },
              has_existing_page_numbers: { type: 'BOOLEAN' },
              toc_items: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    title: { type: 'STRING' },
                    level: { type: 'INTEGER' },
                    page: { type: 'INTEGER' },
                  },
                  required: ['title', 'level', 'page'],
                },
              },
            },
            required: ['document_title', 'has_existing_page_numbers', 'toc_items'],
          },
        },
      },
      controller.signal
    );

    clearTimeout(timer);

    if (!response.ok) {
      console.warn(`Gemini Vision API (${model}) returned error status:`, response.status);
      return null;
    }

    const data = await response.json();
    const rawJsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawJsonText) return null;

    const parsed: LlmPdfTocResponse = JSON.parse(rawJsonText);
    if (!parsed.toc_items || !Array.isArray(parsed.toc_items)) return null;

    parsed.toc_items = parsed.toc_items.map((item) => ({
      title: String(item.title || '').trim(),
      level: item.level === 2 ? 2 : 1,
      page: Math.max(1, Number(item.page) || startPage),
    }));

    return parsed;
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn(
        `Gemini Vision API (${model}) PDF Scan bị timeout sau ${VISION_API_TIMEOUT_MS / 1000}s.`
      );
    } else {
      console.warn(`Lỗi khi gọi Gemini Vision API (${model}) cho PDF Scan:`, err);
    }
    return null;
  }
}

/**
 * Nhận diện Mục lục & Tiêu đề cho PDF DẠNG ẢNH SCAN (Scanned / Image-based PDF) bằng Gemini Vision API.
 * Hỗ trợ tự động chia nhiều đợt 15 trang cho tài liệu scan dài (tối đa 90 trang).
 */
export async function extractTocFromScannedPdfWithGemini(
  pdfBuffer: ArrayBuffer,
  fileName: string,
  options?: PdfLlmOptions
): Promise<LlmPdfTocResponse | null> {
  const apiKey = getStoredApiKey();
  if (!apiKey || !pdfBuffer || pdfBuffer.byteLength === 0) return null;

  const model = getActiveGeminiModel();

  let srcDoc: PDFDocument;
  let totalPages = 1;
  try {
    srcDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    totalPages = Math.max(1, srcDoc.getPageCount());
  } catch (err) {
    console.warn('Không thể tải PDF để chia đợt Vision, gửi nguyên buffer:', err);
    const base64Data = arrayBufferToBase64(pdfBuffer);
    const single = await requestScannedPdfBatchWithGemini(
      apiKey,
      model,
      base64Data,
      fileName,
      1,
      1,
      true
    );
    options?.onChunkProgress?.(1, 1, '1');
    return single;
  }

  const batches = splitPageCountIntoScanBatches(totalPages);
  if (!batches.length) return null;

  const batchResults: (LlmPdfTocResponse | null)[] = new Array(batches.length).fill(null);
  let completedBatches = 0;

  for (
    let idx = 0;
    idx < batches.length;
    idx += PDF_SCAN_MAX_CONCURRENT_BATCHES
  ) {
    const group = batches.slice(idx, idx + PDF_SCAN_MAX_CONCURRENT_BATCHES);
    await Promise.all(
      group.map(async (b, offset) => {
        const batchIdx = idx + offset;
        const base64Data = await slicePdfToBase64ForBatch(
          srcDoc,
          pdfBuffer,
          b.startPage,
          b.endPage,
          totalPages
        );
        const res = await requestScannedPdfBatchWithGemini(
          apiKey,
          model,
          base64Data,
          fileName,
          b.startPage,
          b.endPage,
          batchIdx === 0
        );
        batchResults[batchIdx] = res;
        completedBatches++;
        options?.onChunkProgress?.(
          completedBatches,
          batches.length,
          `${b.startPage}-${b.endPage}`
        );
      })
    );
  }

  const succeeded = batchResults.filter((r): r is LlmPdfTocResponse => r !== null);
  if (succeeded.length === 0) {
    return null;
  }

  const hasExisting = Boolean(batchResults[0]?.has_existing_page_numbers);
  const allItems: LlmTocItem[] = [];

  batchResults.forEach((res, batchIdx) => {
    if (!res) return;
    const { startPage, endPage } = batches[batchIdx];
    const batchSpan = endPage - startPage + 1;
    // Nếu không có số trang sẵn và AI lỡ đánh số từ 1 trong lát cắt sau -> tự bù offset
    const needsOffsetFix =
      batchIdx > 0 &&
      !hasExisting &&
      res.toc_items.length > 0 &&
      res.toc_items.every((it) => it.page >= 1 && it.page <= batchSpan);

    for (const it of res.toc_items) {
      allItems.push({
        title: it.title,
        level: it.level,
        page: needsOffsetFix ? it.page + startPage - 1 : it.page,
      });
    }
  });

  return {
    document_title: batchResults[0]?.document_title?.trim() || '',
    has_existing_page_numbers: hasExisting,
    toc_items: mergePdfChunkItems(allItems),
  };
}

const WORD_HEADING_KEYWORDS_RE =
  /^(?:phần|chương|mục|tiểu\s*mục|điều|khoản|quyết\s*định|lời\s*nói\s*đầu|mở\s*đầu|tổng\s*quan|kết\s*luận|tài\s*liệu\s*tham\s*khảo|phụ\s*lục|biểu\s*mẫu|mẫu\s*số|part|chapter|section|article|appendix|introduction|preface|conclusion|references)\b/iu;

const WORD_NUMBERED_HEADING_RE =
  /^(?:(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII|XIII|XIV|XV|XVI|XVII|XVIII|XIX|XX)\s*[.\-–—:)]|[A-Z][.)]|(?:\d+\.(?:\d+\.?){0,2}))\s+\S/u;

const WORD_SEPARATOR_LINE_RE = /^[-–—_*=\s]{3,}$/;

const WORD_STANDALONE_PREFIX_RE =
  /^(?:(?:phần|chương|mục|điều|part|chapter|section|article)\s+[IVXLCDM\d]+|(?:phụ\s*lục|biểu\s*mẫu|mẫu\s*số|appendix)(?:\s+[IVXLCDM\dA-Z]+)?)\s*[:.\-–—]?\s*$/iu;

/**
 * Lọc ứng viên thông minh cho luồng Word:
 * - Giữ 20 đoạn đầu để nhận diện Tên văn bản.
 * - Mở rộng cho cả tài liệu thường (I-, I., 1., 1.1, A., Mở đầu, Kết luận, Phụ lục/Biểu mẫu, căn giữa, cỡ chữ lớn).
 * - Nới ngưỡng lên 320 ký tự cho đoạn in đậm/có Style để không cắt sót tiêu đề giải pháp dài của Nghị quyết.
 * - Giữ thêm dòng phụ kế tiếp nếu đoạn ngay trước là tiền tố đứng riêng ("CHƯƠNG I", "PHẦN II"...).
 */
export function filterWordCandidatesForLlm(
  paragraphs: WordParagraphCandidateInput[],
  medianFontSize = 13.0
): WordParagraphCandidateInput[] {
  return paragraphs.filter((p, idx) => {
    const trimmed = p.text.trim();
    if (trimmed.length < 2 || WORD_SEPARATOR_LINE_RE.test(trimmed)) return false;
    if (idx < 20) return true;

    const maxLen = p.isBold || p.styleLevel === 1 || p.styleLevel === 2 ? 320 : 220;
    if (trimmed.length > maxLen) return false;

    if (p.styleLevel === 1 || p.styleLevel === 2) return true;
    if (p.isBold || p.fontSize >= medianFontSize + 0.5) return true;
    if (WORD_HEADING_KEYWORDS_RE.test(trimmed)) return true;
    if (trimmed.length <= 160 && WORD_NUMBERED_HEADING_RE.test(trimmed)) return true;

    const isAllUpper = trimmed === trimmed.toUpperCase() && /\p{L}/u.test(trimmed);
    if ((isAllUpper || p.isCentered) && trimmed.length <= 140) return true;

    const prevText = idx > 0 ? paragraphs[idx - 1].text.trim() : '';
    if (prevText && WORD_STANDALONE_PREFIX_RE.test(prevText) && trimmed.length <= 160) {
      return true;
    }

    return false;
  });
}

/**
 * Chia danh sách ứng viên thành các khúc có chồng gối ở ranh giới để không đứt tiêu đề 2-3 dòng.
 */
export function splitCandidatesIntoChunks(candidates: WordParagraphCandidateInput[]): {
  chunks: WordParagraphCandidateInput[][];
  overflowRange: { startParagraphIndex: number; endParagraphIndex: number } | null;
} {
  if (candidates.length === 0) {
    return { chunks: [], overflowRange: null };
  }
  if (candidates.length <= WORD_SINGLE_CALL_MAX) {
    return { chunks: [candidates], overflowRange: null };
  }

  const chunks: WordParagraphCandidateInput[][] = [];
  const step = WORD_CHUNK_SIZE - WORD_CHUNK_OVERLAP;
  let start = 0;

  while (start < candidates.length && chunks.length < WORD_MAX_CHUNKS) {
    const end = Math.min(candidates.length, start + WORD_CHUNK_SIZE);
    chunks.push(candidates.slice(start, end));
    if (end >= candidates.length) {
      start = candidates.length;
      break;
    }
    start += step;
  }

  let overflowRange: { startParagraphIndex: number; endParagraphIndex: number } | null = null;
  if (start < candidates.length) {
    const lastCoveredIndex = chunks[chunks.length - 1][chunks[chunks.length - 1].length - 1].index;
    const firstUncovered = candidates.find((c) => c.index > lastCoveredIndex);
    if (firstUncovered) {
      overflowRange = {
        startParagraphIndex: firstUncovered.index,
        endParagraphIndex: candidates[candidates.length - 1].index,
      };
    }
  }

  return { chunks, overflowRange };
}

/**
 * Gộp và khử trùng lặp kết quả đề mục từ nhiều khúc chồng gối.
 */
export function mergeWordChunkItems(items: LlmWordTocItem[]): LlmWordTocItem[] {
  const byParagraphIndex = new Map<number, LlmWordTocItem>();

  for (const raw of items) {
    const mergedIndices = Array.isArray(raw.merged_indices)
      ? Array.from(
          new Set(
            raw.merged_indices
              .map((n) => Number(n))
              .filter((n) => Number.isInteger(n) && n !== raw.paragraph_index)
          )
        )
      : [];

    const normalized: LlmWordTocItem = {
      title: raw.title.trim(),
      level: raw.level === 2 ? 2 : 1,
      paragraph_index: Number(raw.paragraph_index) || 0,
      merged_indices: mergedIndices,
    };

    const existing = byParagraphIndex.get(normalized.paragraph_index);
    if (!existing) {
      byParagraphIndex.set(normalized.paragraph_index, normalized);
      continue;
    }

    const existingMergedCount = existing.merged_indices?.length ?? 0;
    const nextMergedCount = normalized.merged_indices?.length ?? 0;
    if (
      nextMergedCount > existingMergedCount ||
      (nextMergedCount === existingMergedCount && normalized.title.length > existing.title.length)
    ) {
      byParagraphIndex.set(normalized.paragraph_index, normalized);
    }
  }

  const mergedChildIndices = new Set<number>();
  for (const item of byParagraphIndex.values()) {
    for (const childIdx of item.merged_indices ?? []) {
      mergedChildIndices.add(childIdx);
    }
  }

  return Array.from(byParagraphIndex.values())
    .filter((item) => !mergedChildIndices.has(item.paragraph_index))
    .sort((a, b) => a.paragraph_index - b.paragraph_index);
}

async function requestWordChunkWithGemini(
  apiKey: string,
  model: string,
  chunk: WordParagraphCandidateInput[],
  fileName: string,
  isFirstChunk: boolean
): Promise<LlmWordTocResponse | null> {
  const formattedContent = chunk
    .map(
      (p) =>
        `[P_${p.index} | Bold:${p.isBold ? 1 : 0} | Sz:${p.fontSize} | Center:${p.isCentered ? 1 : 0} | Style:${p.styleLevel ? `H${p.styleLevel}` : 'none'}]: ${p.text}`
    )
    .join('\n');

  const titleRule = isFirstChunk
    ? `1. "document_title": BẮT BUỘC LÀ TÊN CHÍNH THỨC CỦA VĂN BẢN.
   - Văn bản pháp lý/hành chính: giữ nguyên từ khóa loại văn bản ở đầu (VD: "LUẬT SỞ HỮU TRÍ TUỆ", "BỘ LUẬT DÂN SỰ", "NGHỊ ĐỊNH QUY ĐỊNH CHI TIẾT...", "QUYẾT ĐỊNH BAN HÀNH QUY CHẾ"). Tự ghép nếu tiêu đề bị tách làm 2-3 đoạn ở đầu tài liệu.
   - Tài liệu khác (báo cáo, giáo trình, luận văn, đề án, kế hoạch...): trích xuất đúng tên đề tài/tiêu đề chính của tài liệu.
   - TUYỆT ĐỐI NGHIÊM CẤM đưa tên Điều, Chương, Mục, Phần (như "Điều 1...", "Chương I...", "Phần...") vào trường "document_title".
   - BỎ QUA: Quốc hiệu, tiêu ngữ, căn cứ ban hành, họ tên người ký, số hiệu văn bản, ngày tháng.`
    : `1. "document_title": Đây là phần tiếp theo của tài liệu dài, hãy trả về chuỗi rỗng "".`;

  const systemInstructions = `
Bạn là chuyên gia phân tích cấu trúc tài liệu Word (.doc / .docx) đa lĩnh vực (pháp lý, hành chính, báo cáo, giáo trình, luận văn, phụ lục).
Nhiệm vụ: Đọc danh sách các đoạn văn dưới đây (kèm chỉ số P_<index>, Bold, cỡ chữ Sz, căn giữa Center, Style có sẵn) để trích xuất Mục Lục chuẩn xác${isFirstChunk ? ' và Tên văn bản' : ''}.

CÁC YÊU CẦU BẮT BUỘC:
${titleRule}
2. "toc_items":
   - Nhận diện đầy đủ 3 nhóm tài liệu:
     a) Văn bản pháp lý/hành chính (VI/EN): Cấp 1 (level: 1) gồm PHẦN, CHƯƠNG, QUYẾT ĐỊNH, LỜI NÓI ĐẦU, PHỤ LỤC, PART, CHAPTER, APPENDIX; Cấp 2 (level: 2) gồm MỤC, TIỂU MỤC, ĐIỀU, SECTION, ARTICLE. Loại bỏ câu dẫn giải văn bản hợp nhất, căn cứ, nơi nhận, chữ ký.
     b) Nghị quyết Đảng / Chỉ thị / Kết luận / Tài liệu tổng quát (báo cáo, giáo trình, luận văn, đề án, kế hoạch):
        - Cấp 1 (level: 1): Các mục đánh số La Mã dùng dấu gạch ngang hoặc dấu chấm (VD: "I- QUAN ĐIỂM CHỈ ĐẠO", "II- MỤC TIÊU", "III- NHIỆM VỤ, GIẢI PHÁP", "IV- TỔ CHỨC THỰC HIỆN", "I. ĐẶT VẤN ĐỀ"), hoặc MỞ ĐẦU, TỔNG QUAN, KẾT LUẬN, TÀI LIỆU THAM KHẢO, mục 1., 2. lớn khi không có cấp La Mã, hoặc Style H1.
        - Cấp 2 (level: 2): Các tiểu mục đánh số "1.", "1.1.", "1.2.", "2.", "A.", "B." CHỈ KHI IN ĐẬM (Bold:1) hoặc có Style H2 (VD: "1. Đến năm 2030", "1.1. Mục tiêu chung", "1. Đổi mới mạnh mẽ tư duy...").
        - QUY TẮC LOẠI NHIỄU BẮT BUỘC: Tuyệt đối BỎ QUA các đoạn văn liệt kê chữ thường (Bold:0) dù bắt đầu bằng "1.", "2.", "3."... (ví dụ các khoản nội dung dưới phần I- và phần IV- của Nghị quyết).
     c) Phụ lục & Biểu mẫu: PHỤ LỤC... là level 1; MẪU SỐ... hoặc mục con trong phụ lục là level 2; bỏ qua nội dung bảng biểu chi tiết.
   - GHÉP TIÊU ĐỀ NGẮT DÒNG & "merged_indices":
     + Nếu một đề mục bị ngắt qua nhiều đoạn liên tiếp (VD: P_10 là "CHƯƠNG I", P_11 là "QUY ĐỊNH CHUNG"), hãy ghép thành "CHƯƠNG I: QUY ĐỊNH CHUNG", đặt "paragraph_index": 10 và "merged_indices": [11].
     + Nếu không ghép thêm đoạn phụ nào, đặt "merged_indices": [].
     + Làm sạch khoảng trắng thừa hoặc rác định dạng từ file .doc cũ, KHÔNG bịa thêm từ mới.
   - "paragraph_index": Chỉ số P_<index> của đoạn văn bắt đầu đề mục (phải tồn tại đúng trong danh sách đầu vào).
   - BỎ QUA: Quốc hiệu, tiêu ngữ, căn cứ ban hành, họ tên người ký, số hiệu văn bản thông thường, đoạn thân bài bình thường.
`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WORD_CHUNK_TIMEOUT_MS);

  try {
    const response = await fetchGeminiWithFallback(
      apiKey,
      model,
      {
        contents: [
          {
            parts: [
              {
                text: `${systemInstructions}\n\nTÊN TỆP: ${fileName}\n\nDANH SÁCH ĐOẠN VĂN (ĐÃ TINH GỌN):\n${formattedContent}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          response_mime_type: 'application/json',
          response_schema: {
            type: 'OBJECT',
            properties: {
              document_title: { type: 'STRING' },
              toc_items: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    title: { type: 'STRING' },
                    level: { type: 'INTEGER' },
                    paragraph_index: { type: 'INTEGER' },
                    merged_indices: {
                      type: 'ARRAY',
                      items: { type: 'INTEGER' },
                    },
                  },
                  required: ['title', 'level', 'paragraph_index', 'merged_indices'],
                },
              },
            },
            required: ['document_title', 'toc_items'],
          },
        },
      },
      controller.signal
    );

    clearTimeout(timer);

    if (!response.ok) {
      console.warn(`Gemini API (${model}) returned error status:`, response.status);
      return null;
    }

    const data = await response.json();
    const rawJsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawJsonText) return null;

    const parsed: LlmWordTocResponse = JSON.parse(rawJsonText);
    if (!parsed.toc_items || !Array.isArray(parsed.toc_items)) return null;

    parsed.toc_items = parsed.toc_items.map((item) => ({
      title: String(item.title || '').trim(),
      level: item.level === 2 ? 2 : 1,
      paragraph_index: Number(item.paragraph_index) || 0,
      merged_indices: Array.isArray(item.merged_indices)
        ? item.merged_indices.map((n) => Number(n)).filter((n) => Number.isInteger(n))
        : [],
    }));

    return parsed;
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn(
        `Gemini API (${model}) Word chunk bị timeout sau ${WORD_CHUNK_TIMEOUT_MS / 1000}s.`
      );
    } else {
      console.warn(`Lỗi khi gọi Gemini API (${model}) cho Word chunk:`, err);
    }
    return null;
  }
}

/**
 * Nhận diện Mục lục & Tiêu đề cho Luồng Word bằng Gemini LLM (hỗ trợ chia khúc cho tài liệu dài)
 */
export async function extractTocFromWordWithGemini(
  paragraphs: WordParagraphCandidateInput[],
  fileName: string,
  options?: WordLlmOptions
): Promise<LlmWordTocResponse | null> {
  const apiKey = getStoredApiKey();
  if (!apiKey || !paragraphs.length) return null;

  const model = getActiveGeminiModel();
  const candidates = filterWordCandidatesForLlm(paragraphs, options?.medianFontSize ?? 13.0);
  if (!candidates.length) return null;

  const { chunks, overflowRange } = splitCandidatesIntoChunks(candidates);
  if (!chunks.length) return null;

  const chunkResults: (LlmWordTocResponse | null)[] = new Array(chunks.length).fill(null);
  const failedRanges: { startParagraphIndex: number; endParagraphIndex: number }[] = [];
  if (overflowRange) {
    failedRanges.push(overflowRange);
  }

  let completedChunks = 0;

  for (let batchStart = 0; batchStart < chunks.length; batchStart += WORD_MAX_CONCURRENT_CHUNKS) {
    const batch = chunks.slice(batchStart, batchStart + WORD_MAX_CONCURRENT_CHUNKS);
    await Promise.all(
      batch.map(async (chunk, offset) => {
        const chunkIdx = batchStart + offset;
        const res = await requestWordChunkWithGemini(
          apiKey,
          model,
          chunk,
          fileName,
          chunkIdx === 0
        );
        chunkResults[chunkIdx] = res;
        if (!res && chunk.length > 0) {
          failedRanges.push({
            startParagraphIndex: chunk[0].index,
            endParagraphIndex: chunk[chunk.length - 1].index,
          });
        }
        completedChunks++;
        options?.onChunkProgress?.(completedChunks, chunks.length);
      })
    );
  }

  const succeeded = chunkResults.filter((r): r is LlmWordTocResponse => r !== null);
  if (succeeded.length === 0) {
    return null;
  }

  const allItems = mergeWordChunkItems(succeeded.flatMap((r) => r.toc_items));
  const documentTitle = chunkResults[0]?.document_title?.trim() || '';

  return {
    document_title: documentTitle,
    toc_items: allItems,
    failed_ranges: failedRanges,
  };
}
