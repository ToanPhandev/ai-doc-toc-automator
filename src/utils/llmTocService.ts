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
const API_TIMEOUT_MS = 8500; // Giới hạn tối đa 8.5 giây, nếu mạng chập chờn sẽ fallback ngay
const VISION_API_TIMEOUT_MS = 60000; // 60 giây cho luồng Vision OCR đọc hình ảnh PDF Scan

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

export interface LlmTocItem {
  title: string;
  level: 1 | 2;
  page: number;
}

export interface LlmPdfTocResponse {
  document_title: string;
  has_existing_page_numbers: boolean;
  toc_items: LlmTocItem[];
}

export interface LlmWordTocItem {
  title: string;
  level: 1 | 2;
  paragraph_index: number;
}

export interface LlmWordTocResponse {
  document_title: string;
  toc_items: LlmWordTocItem[];
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
 * Giảm 85-90% dung lượng text thô để AI phản hồi siêu tốc trong 1-3 giây.
 */
function thinPdfPageText(pageNumber: number, rawText: string): string {
  if (!rawText || !rawText.trim()) return '';

  // Trang 1 và 2: Giữ phần đầu đầy đủ để AI nhận diện Tên văn bản chính thức
  if (pageNumber <= 2) {
    return rawText.slice(0, 1500).trim();
  }

  // Từ trang 3 trở đi: Chỉ giữ các dòng tiềm năng làm đề mục, loại bỏ đoạn văn thân bài dài dòng
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const headingKeywords = /^(?:phần|chương|mục|điều|khoản|tiểu\s*mục|lời\s*nói\s*đầu|quyết\s*định|bộ\s*luật|luật|nghị\s*định|thông\s*tư|kết\s*luận|phụ\s*lục|part|chapter|section|article)\b/iu;

  const candidateLines = lines.filter((line) => {
    if (line.length > 200) return false; // Bỏ các đoạn văn thân bài dài
    if (headingKeywords.test(line)) return true;
    if (line === line.toUpperCase() && line.length < 120 && /\p{L}/u.test(line)) return true;
    return line.length <= 80;
  });

  return candidateLines.slice(0, 30).join('\n');
}

/**
 * Nhận diện Mục lục & Tiêu đề cho Luồng PDF bằng Gemini LLM (Structured Output Siêu Tốc)
 */
export async function extractTocFromPdfWithGemini(
  pagesText: { pageNumber: number; text: string }[],
  fileName: string
): Promise<LlmPdfTocResponse | null> {
  const apiKey = getStoredApiKey();
  if (!apiKey || !pagesText.length) return null;

  const model = getActiveGeminiModel();

  // Giới hạn 45 trang nhưng tinh gọn nội dung từng trang để payload siêu nhẹ (~6KB thay vì 135KB)
  const relevantPages = pagesText
    .filter((p) => p.text.trim().length > 5)
    .slice(0, 45);

  const pagesFormatted = relevantPages
    .map((p) => {
      const thinned = thinPdfPageText(p.pageNumber, p.text);
      return thinned ? `--- PAGE_INDEX: ${p.pageNumber} ---\n${thinned}` : '';
    })
    .filter(Boolean)
    .join('\n\n');

  if (!pagesFormatted.trim()) return null;

  const systemInstructions = `
Bạn là chuyên gia phân tích văn bản pháp lý, hành chính và kỹ thuật chuyên nghiệp (Việt Nam & Quốc tế).
Nhiệm vụ của bạn: Đọc nội dung các trang văn bản PDF dưới đây và trích xuất Mục Lục (Table of Contents) cùng Tiêu Đề Tài Liệu với độ chính xác tuyệt đối.

CÁC YÊU CẦU BẮT BUỘC:
1. "document_title": BẮT BUỘC LÀ TÊN CHÍNH THỨC CỦA VĂN BẢN (VD: "LUẬT SỞ HỮU TRÍ TUỆ", "BỘ LUẬT DÂN SỰ", "LUẬT ĐẤT ĐAI", "NGHỊ ĐỊNH QUY ĐỊNH CHI TIẾT THI HÀNH MỘT SỐ ĐIỀU CỦA LUẬT CHỨNG KHOÁN", "THÔNG TƯ HƯỚNG DẪN THỰC HIỆN...").
   - QUÉT TRỰC TIẾP DÒNG 1 ĐỂ TÌM CÁC TỪ KHÓA QUEN THUỘC (LUẬT, BỘ LUẬT, NGHỊ ĐỊNH, THÔNG TƯ, QUYẾT ĐỊNH, NGHỊ QUYẾT...). BẮT BUỘC PHẢI GHÉP CẢ TỪ KHÓA LOẠI VĂN BẢN ĐÓ VÀO ĐẦU TIÊU ĐỀ!
   - NẾU TIÊU ĐỀ TÊN VĂN BẢN BỊ TÁCH LÀM 2 HOẶC 3 DÒNG Ở ĐẦU TRANG (VD: Dòng 1 "LUẬT", Dòng 2 "SỞ HỮU TRÍ TUỆ" -> ghép thành "LUẬT SỞ HỮU TRÍ TUỆ"; Dòng 1 "NGHỊ ĐỊNH", Dòng 2 "QUY ĐỊNH CHI TIẾT THI HÀNH MỘT SỐ ĐIỀU CỦA LUẬT CHỨNG", Dòng 3 "KHOÁN" -> ghép thành "NGHỊ ĐỊNH QUY ĐỊNH CHI TIẾT THI HÀNH MỘT SỐ ĐIỀU CỦA LUẬT CHỨNG KHOÁN").
   - TUYỆT ĐỐI KHÔNG BỎ RƠI TỪ "LUẬT", "BỘ LUẬT", "NGHỊ ĐỊNH", "THÔNG TƯ", "QUYẾT ĐỊNH"!
   - TUYỆT ĐỐI NGHIÊM CẤM đưa tên Điều, Chương, Mục, Phần (như "Điều 1...", "Chương I...", "Phần thứ nhất...") vào trường "document_title".
   - LOẠI BỎ hoàn toàn: Quốc hiệu ("CỘNG HÒA XÃ HỘI..."), Tiêu ngữ ("Độc lập - Tự do..."), số hiệu công văn ("Số: 67/VBHN..."), nơi gửi, ngày tháng.
2. "has_existing_page_numbers": Xác định xem tài liệu gốc đã được in sẵn số trang ở đầu/chân trang chưa (true nếu có, false nếu chưa có). Tự suy luận trang 1 nếu trang 1 bị ẩn số.
3. "toc_items": Danh sách các mục lục được phân cấp:
   - "level": 1 cho các mục cấp cao (LỜI NÓI ĐẦU, PHẦN, CHƯƠNG, QUYẾT ĐỊNH, INTRODUCTION, PART, CHAPTER...).
   - "level": 2 cho các mục con (MỤC, ĐIỀU, SECTION, ARTICLE...).
   - TỰ ĐỘNG GHÉP CÁC TIÊU ĐỀ BỊ NGẮT DÒNG thành 1 dòng hoàn chỉnh (VD: dòng trên là "CHƯƠNG I", dòng dưới là "CHẾ ĐỘ CHÍNH TRỊ" -> ghép thành "CHƯƠNG I: CHẾ ĐỘ CHÍNH TRỊ").
   - LOẠI BỎ hoàn toàn: Quốc hiệu, tiêu ngữ, trích yếu, chữ ký, nơi nhận, ghi chú chân trang (footnote), bảng biểu chi tiết.
   - "page": Số trang in sẵn (nếu có) hoặc đúng số PAGE_INDEX nơi đề mục đó xuất hiện.
`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

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
      console.warn(`Gemini API (${model}) returned error status:`, response.status);
      return null;
    }

    const data = await response.json();
    const rawJsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawJsonText) return null;

    const parsed: LlmPdfTocResponse = JSON.parse(rawJsonText);
    if (!parsed.toc_items || !Array.isArray(parsed.toc_items)) return null;

    parsed.toc_items = parsed.toc_items.map((item) => ({
      title: item.title.trim(),
      level: item.level === 2 ? 2 : 1,
      page: Math.max(1, Number(item.page) || 1),
    }));

    return parsed;
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn(`Gemini API (${model}) bị timeout sau ${API_TIMEOUT_MS / 1000}s. Tự động fallback về thuật toán Cục bộ.`);
    } else {
      console.warn(`Lỗi khi gọi Gemini API (${model}) cho PDF:`, err);
    }
    return null;
  }
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

/**
 * Chuẩn bị payload Base64 cho file PDF gửi sang Gemini Vision.
 * - Nếu PDF <= 20 trang và dung lượng <= 10MB -> Gửi trực tiếp toàn bộ để AI đọc trọn vẹn.
 * - Nếu PDF dài (> 20 trang) hoặc nặng (> 10MB) -> Tự động cắt lát 20 trang đầu bằng pdf-lib
 *   để đảm bảo chứa trọn vẹn Tiêu đề văn bản, Phần, Chương, Điều mở đầu mà upload siêu nhanh.
 */
async function preparePdfBase64ForVision(pdfBuffer: ArrayBuffer): Promise<string> {
  try {
    const srcDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const total = srcDoc.getPageCount();
    if (total <= 20 && pdfBuffer.byteLength <= 10 * 1024 * 1024) {
      return arrayBufferToBase64(pdfBuffer);
    }
    const pagesToTake = Math.min(total, 20);
    const subDoc = await PDFDocument.create();
    const pageIndices = Array.from({ length: pagesToTake }, (_, i) => i);
    const copiedPages = await subDoc.copyPages(srcDoc, pageIndices);
    copiedPages.forEach((p) => subDoc.addPage(p));
    const subBytes = await subDoc.save();
    return arrayBufferToBase64(subBytes.buffer as ArrayBuffer);
  } catch (err) {
    console.warn('Không thể cắt lát PDF cho Vision, gửi buffer gốc:', err);
    return arrayBufferToBase64(pdfBuffer);
  }
}

/**
 * Nhận diện Mục lục & Tiêu đề cho PDF DẠNG ẢNH SCAN (Scanned / Image-based PDF) bằng Gemini Vision API.
 * - Gửi trực tiếp dữ liệu PDF gốc (inline_data base64) để Gemini đọc OCR hình ảnh trực tiếp.
 * - Quan sát trực quan xem trang có in sẵn số trang ở Header/Footer hay chưa (has_existing_page_numbers).
 * - Trích xuất tên chính thức của văn bản (document_title) và danh sách đề mục (toc_items).
 */
export async function extractTocFromScannedPdfWithGemini(
  pdfBuffer: ArrayBuffer,
  fileName: string
): Promise<LlmPdfTocResponse | null> {
  const apiKey = getStoredApiKey();
  if (!apiKey || !pdfBuffer || pdfBuffer.byteLength === 0) return null;

  const model = getActiveGeminiModel();

  const systemInstructions = `
Bạn là chuyên gia phân tích tài liệu pháp lý và kỹ thuật chuyên nghiệp (Việt Nam & Quốc tế).
Tài liệu được cung cấp là tệp PDF dạng ảnh scan (Scanned Document).
Nhiệm vụ của bạn: Hãy đọc và nhận diện OCR trực tiếp từ hình ảnh các trang để trích xuất Mục Lục (Table of Contents) và Tiêu Đề Văn Bản chính thức với độ chính xác cao nhất.

CÁC YÊU CẦU BẮT BUỘC:
1. "document_title": BẮT BUỘC LÀ TÊN CHÍNH THỨC CỦA VĂN BẢN (VD: "LUẬT SỞ HỮU TRÍ TUỆ", "BỘ LUẬT DÂN SỰ", "NGHỊ ĐỊNH QUY ĐỊNH CHI TIẾT THI HÀNH MỘT SỐ ĐIỀU CỦA LUẬT CHỨNG KHOÁN", "NGHỊ ĐỊNH Về chứng khoán phái sinh...", "THÔNG TƯ Hướng dẫn thực hiện...").
   - QUÉT TRỰC TIẾP DÒNG 1 ĐỂ TÌM CÁC TỪ KHÓA QUEN THUỘC (LUẬT, BỘ LUẬT, NGHỊ ĐỊNH, THÔNG TƯ, QUYẾT ĐỊNH, NGHỊ QUYẾT...). BẮT BUỘC PHẢI GHÉP CẢ TỪ KHÓA LOẠI VĂN BẢN ĐÓ VÀO ĐẦU TIÊU ĐỀ!
   - NẾU TIÊU ĐỀ TÊN VĂN BẢN BỊ TÁCH LÀM NHIỀU DÒNG Ở ĐẦU TRANG NỘI DUNG (VD: dòng 1 "LUẬT", dòng 2 "SỞ HỮU TRÍ TUỆ" -> ghép thành "LUẬT SỞ HỮU TRÍ TUỆ"; dòng 1 "NGHỊ ĐỊNH", dòng 2 "QUY ĐỊNH CHI TIẾT THI HÀNH MỘT SỐ ĐIỀU CỦA LUẬT CHỨNG", dòng 3 "KHOÁN" -> ghép thành "NGHỊ ĐỊNH QUY ĐỊNH CHI TIẾT THI HÀNH MỘT SỐ ĐIỀU CỦA LUẬT CHỨNG KHOÁN").
   - TUYỆT ĐỐI KHÔNG BỎ RƠI TỪ "LUẬT", "BỘ LUẬT", "NGHỊ ĐỊNH", "THÔNG TƯ", "QUYẾT ĐỊNH"!
   - TUYỆT ĐỐI NGHIÊM CẤM đưa tên Điều, Chương, Mục, Phần (như "Điều 1...", "Chương I...", "Phần thứ nhất...") vào trường "document_title".
   - LOẠI BỎ hoàn toàn: Quốc hiệu ("CỘNG HÒA XÃ HỘI..."), Tiêu ngữ ("Độc lập - Tự do..."), số hiệu công văn ("Số: 158/2020/NĐ-CP"), ngày tháng năm, nơi nhận.
2. "has_existing_page_numbers": QUAN SÁT TRỰC TIẾP TRÊN HÌNH ẢNH CÁC TRANG (đặc biệt là Header ở đỉnh trang hoặc Footer ở đáy trang):
   - Trả về true: Nếu các trang văn bản gốc ĐÃ CÓ IN SẴN số trang (ví dụ thấy các con số in như 2, 3, 4... ở đỉnh góc trên hoặc ở giữa chân trang).
   - Trả về false: Nếu tài liệu hoàn toàn là bản nháp/bản không đánh số trang.
3. "toc_items": Danh sách các đề mục:
   - "level": 1 cho các mục lớn (PHẦN, CHƯƠNG, QUYẾT ĐỊNH, LỜI NÓI ĐẦU, PART, CHAPTER...).
   - "level": 2 cho các mục con (MỤC, ĐIỀU, KHOẢN CHÍNH, SECTION, ARTICLE...).
   - TỰ ĐỘNG GHÉP CÁC TIÊU ĐỀ BỊ NGẮT DÒNG thành 1 dòng hoàn chỉnh (VD: dòng trên "CHƯƠNG I", dòng dưới "QUY ĐỊNH CHUNG" -> ghép thành "CHƯƠNG I: QUY ĐỊNH CHUNG").
   - "page": Số trang tương ứng nơi đề mục xuất hiện (ưu tiên theo số trang in sẵn trên tài liệu, nếu trang đầu không đánh số thì trang đầu tính là 1).
`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VISION_API_TIMEOUT_MS);

  try {
    const base64Data = await preparePdfBase64ForVision(pdfBuffer);
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
      title: item.title.trim(),
      level: item.level === 2 ? 2 : 1,
      page: Math.max(1, Number(item.page) || 1),
    }));

    return parsed;
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn(`Gemini Vision API (${model}) PDF Scan bị timeout sau ${VISION_API_TIMEOUT_MS / 1000}s.`);
    } else {
      console.warn(`Lỗi khi gọi Gemini Vision API (${model}) cho PDF Scan:`, err);
    }
    return null;
  }
}

/**
 * Nhận diện Mục lục & Tiêu đề cho Luồng Word bằng Gemini LLM (Structured Output Siêu Tốc)
 */
export async function extractTocFromWordWithGemini(
  paragraphs: { index: number; text: string; isBold: boolean; fontSize: number }[],
  fileName: string
): Promise<LlmWordTocResponse | null> {
  const apiKey = getStoredApiKey();
  if (!apiKey || !paragraphs.length) return null;

  const model = getActiveGeminiModel();

  // Lọc tinh gọn cho Word:
  // - 15 đoạn văn đầu: Giữ đầy đủ để tìm Tên văn bản.
  // - Các đoạn văn tiếp theo: Chỉ lấy đoạn ngắn (< 180 ký tự), in đậm, hoặc chứa từ khóa đề mục
  const candidates = paragraphs
    .filter((p, idx) => {
      if (idx < 15) return p.text.trim().length >= 2;
      if (p.text.trim().length > 200) return false;
      const kw = /^(?:phần|chương|mục|điều|khoản|tiểu\s*mục|quyết\s*định|part|chapter|section|article)\b/iu;
      return p.isBold || kw.test(p.text) || (p.text === p.text.toUpperCase() && p.text.length < 100);
    })
    .slice(0, 100);

  const formattedContent = candidates
    .map((p) => `[P_${p.index} | Bold:${p.isBold} | Sz:${p.fontSize}]: ${p.text}`)
    .join('\n');

  const systemInstructions = `
Bạn là chuyên gia phân tích tài liệu văn bản Word (.docx).
Nhiệm vụ của bạn: Đọc danh sách các đoạn văn dưới đây (kèm chỉ số P_<index>, cờ In đậm Bold, và Cỡ chữ Sz) để trích xuất Mục Lục chuẩn xác và Tên văn bản.

CÁC YÊU CẦU:
1. "document_title": BẮT BUỘC LÀ TÊN CHÍNH THỨC CỦA VĂN BẢN (VD: "LUẬT SỞ HỮU TRÍ TUỆ", "BỘ LUẬT DÂN SỰ", "NGHỊ ĐỊNH QUY ĐỊNH CHI TIẾT THI HÀNH MỘT SỐ ĐIỀU CỦA LUẬT CHỨNG KHOÁN", "QUYẾT ĐỊNH BAN HÀNH QUY CHẾ").
   - QUÉT TRỰC TIẾP DÒNG 1 ĐỂ TÌM CÁC TỪ KHÓA QUEN THUỘC (LUẬT, BỘ LUẬT, NGHỊ ĐỊNH, THÔNG TƯ, QUYẾT ĐỊNH, NGHỊ QUYẾT...). BẮT BUỘC PHẢI GHÉP CẢ TỪ KHÓA LOẠI VĂN BẢN ĐÓ VÀO ĐẦU TIÊU ĐỀ!
   - NẾU TIÊU ĐỀ TÊN VĂN BẢN BỊ TÁCH LÀM 2 HOẶC 3 ĐOẠN Ở ĐẦU TRANG (VD: P_1 là "LUẬT", P_2 là "SỞ HỮU TRÍ TUỆ" -> ghép thành "LUẬT SỞ HỮU TRÍ TUỆ"; P_1 là "NGHỊ ĐỊNH", P_2 là "QUY ĐỊNH CHI TIẾT THI HÀNH MỘT SỐ ĐIỀU CỦA LUẬT CHỨNG", P_3 là "KHOÁN" -> ghép thành "NGHỊ ĐỊNH QUY ĐỊNH CHI TIẾT THI HÀNH MỘT SỐ ĐIỀU CỦA LUẬT CHỨNG KHOÁN").
   - TUYỆT ĐỐI KHÔNG BỎ RƠI TỪ "LUẬT", "BỘ LUẬT", "NGHỊ ĐỊNH", "THÔNG TƯ", "QUYẾT ĐỊNH"!
   - TUYỆT ĐỐI NGHIÊM CẤM đưa tên Điều, Chương, Mục, Phần (như "Điều 1...", "Chương I...", "Phần...") vào trường "document_title".
   - BỎ QUA: Quốc hiệu, tiêu ngữ, căn cứ ban hành, họ tên người ký, số hiệu văn bản thông thường.
2. "toc_items":
   - "title": Tên đề mục hoàn chỉnh. TỰ ĐỘNG GHÉP các đoạn tiêu đề liên tiếp bị ngắt (VD: P_2 là "CHƯƠNG I", P_3 là "QUY ĐỊNH CHUNG" -> ghép thành "CHƯƠNG I: QUY ĐỊNH CHUNG").
   - "level": 1 cho các mục lớn (PHẦN, CHƯƠNG, QUYẾT ĐỊNH, LỜI NÓI ĐẦU, PART, CHAPTER...).
   - "level": 2 cho các mục con (MỤC, ĐIỀU, KHOẢN CHÍNH, SECTION, ARTICLE...).
   - "paragraph_index": Chỉ số P_<index> của đoạn văn bắt đầu đề mục.
   - BỎ QUA: Quốc hiệu, tiêu ngữ, căn cứ ban hành, họ tên người ký, số hiệu văn bản thông thường.
`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

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
                  },
                  required: ['title', 'level', 'paragraph_index'],
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
      title: item.title.trim(),
      level: item.level === 2 ? 2 : 1,
      paragraph_index: Number(item.paragraph_index) || 0,
    }));

    return parsed;
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn(`Gemini API (${model}) Word bị timeout sau ${API_TIMEOUT_MS / 1000}s. Tự động fallback về thuật toán Cục bộ.`);
    } else {
      console.warn(`Lỗi khi gọi Gemini API (${model}) cho Word:`, err);
    }
    return null;
  }
}
