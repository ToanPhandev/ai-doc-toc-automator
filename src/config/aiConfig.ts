/**
 * =========================================================================
 * CẤU HÌNH MÔ HÌNH AI TRỰC TIẾP TRONG CODE:
 * Bạn có thể thay đổi giá trị của DEFAULT_GEMINI_MODEL bên dưới
 * hoặc cấu hình thông qua biến môi trường VITE_GEMINI_MODEL trong file .env
 * =========================================================================
 */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
export const FALLBACK_GEMINI_MODEL = 'gemini-3.1-flash-lite-preview';

export interface GeminiModelOption {
  id: string;
  name: string;
  description: string;
}

export const SUPPORTED_GEMINI_MODELS: GeminiModelOption[] = [
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash-Lite (Khuyên dùng - 500 lượt/ngày)',
    description: 'Tốc độ rất nhanh, hạn mức miễn phí cao (500 RPD / 15 RPM), hỗ trợ Multimodal PDF Scan',
  },
  {
    id: 'gemini-3.1-flash-lite-preview',
    name: 'Gemini 3.1 Flash-Lite Preview (Dự phòng - 500 lượt/ngày)',
    description: 'Bản dự phòng ổn định, đã kiểm chứng trích xuất chuẩn PDF Scan, tự động chuyển khi mô hình chính quá tải/hết lượt',
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash (Hạn mức thấp - 20 lượt/ngày)',
    description: 'Bản tiêu chuẩn, độ chính xác cao nhưng Free tier chỉ có 20 lượt/ngày',
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash (Hạn mức thấp - 20 lượt/ngày)',
    description: 'Bản thử nghiệm cao cấp của Google (tự động fallback nếu 429/503)',
  },
];

/**
 * Lấy mô hình Gemini đang hoạt động:
 * 1. Ưu tiên đọc từ biến môi trường VITE_GEMINI_MODEL trong file .env
 * 2. Nếu không có, sử dụng DEFAULT_GEMINI_MODEL trực tiếp trong code
 */
export function getActiveGeminiModel(): string {
  try {
    const fromEnv = (import.meta as unknown as { env?: { VITE_GEMINI_MODEL?: string } }).env?.VITE_GEMINI_MODEL;
    if (fromEnv && fromEnv.trim()) {
      return fromEnv.trim();
    }
  } catch {
    // ignore
  }
  return DEFAULT_GEMINI_MODEL;
}
