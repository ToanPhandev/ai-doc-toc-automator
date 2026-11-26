/**
 * =========================================================================
 * CẤU HÌNH MÔ HÌNH AI TRỰC TIẾP TRONG CODE:
 * Bạn có thể thay đổi giá trị của DEFAULT_GEMINI_MODEL bên dưới
 * hoặc cấu hình thông qua biến môi trường VITE_GEMINI_MODEL trong file .env
 * =========================================================================
 */
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
export const FALLBACK_GEMINI_MODEL = 'gemini-2.5-flash';

export interface GeminiModelOption {
  id: string;
  name: string;
  description: string;
}

export const SUPPORTED_GEMINI_MODELS: GeminiModelOption[] = [
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash (Khuyên dùng - Ổn định nhất)',
    description: 'Thế hệ mới nhất, tốc độ cực nhanh, ổn định 100%, hỗ trợ Multimodal PDF Scan',
  },
  {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini 3.1 Flash-Lite (Siêu nhẹ)',
    description: 'Phiên bản rút gọn siêu nhanh, tiết kiệm tài nguyên tối đa',
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash (Mới nhất - Có thể quá tải)',
    description: 'Bản thử nghiệm cao cấp nhất của Google (tự động fallback nếu 503)',
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
