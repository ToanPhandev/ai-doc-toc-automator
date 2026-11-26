import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  BookOpenCheck,
  Check,
  Cpu,
  Eye,
  EyeOff,
  FileCheck2,
  Key,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  getActiveGeminiModel,
  SUPPORTED_GEMINI_MODELS,
} from '../config/aiConfig';
import {
  getStoredApiKey,
  hasGeminiApiKey,
  isApiKeyFromEnv,
  setStoredApiKey,
  testGeminiApiKey,
} from '../utils/llmTocService';

export const Header: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isAiActive, setIsAiActive] = useState(false);
  const [fromEnv, setFromEnv] = useState(false);
  const [currentModel, setCurrentModel] = useState('gemini-1.5-flash');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    const current = getStoredApiKey();
    setApiKey(current);
    setIsAiActive(Boolean(current));
    setFromEnv(isApiKeyFromEnv());
    setCurrentModel(getActiveGeminiModel());
  }, []);

  const handleOpenModal = () => {
    setApiKey(getStoredApiKey());
    setFromEnv(isApiKeyFromEnv());
    setCurrentModel(getActiveGeminiModel());
    setTestResult(null);
    setIsModalOpen(true);
  };

  const handleSave = () => {
    setStoredApiKey(apiKey);
    const active = hasGeminiApiKey();
    setIsAiActive(active);
    setTestResult({
      success: true,
      message: active ? 'Đã lưu khóa API Gemini thành công!' : 'Đã xóa khóa API (Chuyển sang chế độ Cục bộ).',
    });
  };

  const handleClear = () => {
    setApiKey('');
    setStoredApiKey('');
    setIsAiActive(false);
    setTestResult({
      success: true,
      message: 'Đã xóa khóa API. Hệ thống sẽ hoạt động ở chế độ Cục bộ (Offline).',
    });
  };

  const handleTest = async () => {
    if (!apiKey.trim()) {
      setTestResult({ success: false, message: 'Vui lòng nhập API key trước khi kiểm tra.' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testGeminiApiKey(apiKey.trim(), currentModel);
      setTestResult(res);
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/20">
              <BookOpenCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                  AutoTOC & PageNumber
                </h1>
                <span className="hidden rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-600/20 sm:inline-flex">
                  VI / EN
                </span>
              </div>
              <p className="text-xs text-slate-500 sm:text-sm">
                Tự động tạo Mục lục chấm bi, bảo toàn định dạng & đổi tên thông minh
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Nút Trạng thái & Cấu hình Gemini AI */}
            <button
              type="button"
              onClick={handleOpenModal}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all shadow-sm ${
                isAiActive
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 hover:border-emerald-300'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
              }`}
              title="Cấu hình Google Gemini API Key & Mô hình"
            >
              {isAiActive ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="hidden sm:inline">
                    AI: {currentModel} {fromEnv ? '(.env)' : ''}
                  </span>
                  <span className="sm:hidden">AI Bật</span>
                </>
              ) : (
                <>
                  <Key className="h-3.5 w-3.5 text-slate-500" />
                  <span className="hidden sm:inline">Cục bộ (Chưa có Key)</span>
                  <span className="sm:hidden">Cài Key</span>
                </>
              )}
            </button>

            <div className="hidden items-center gap-1.5 lg:flex">
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                <FileCheck2 className="h-3 w-3 text-blue-600" />
                Word (.docx)
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                <Sparkles className="h-3 w-3 text-emerald-600" />
                PDF
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Modal Cấu hình API Key & Mô hình */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl transition-all">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Cấu hình Google Gemini AI
                  </h3>
                  <p className="text-xs text-slate-500">
                    Chọn mô hình & cấu hình API Key trực tiếp qua .env hoặc giao diện
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {/* Mô hình đang kích hoạt */}
              <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs text-blue-900 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-blue-900">
                  <Cpu className="h-4 w-4 text-blue-600" />
                  <span>Mô hình đang hoạt động:</span>
                  <span className="rounded bg-blue-200/80 px-2 py-0.5 font-mono text-xs font-bold text-blue-950">
                    {currentModel}
                  </span>
                </div>
                <p className="text-slate-600 text-[11px] leading-relaxed">
                  Bạn có thể đổi mô hình trực tiếp trong code tại file{' '}
                  <code className="font-mono font-semibold text-blue-800">src/config/aiConfig.ts</code>{' '}
                  hoặc qua biến <code className="font-mono font-semibold text-blue-800">VITE_GEMINI_MODEL</code> trong file{' '}
                  <code className="font-mono font-semibold text-blue-800">.env</code>.
                </p>
                <div className="pt-1 flex flex-wrap gap-1.5">
                  {SUPPORTED_GEMINI_MODELS.map((m) => (
                    <span
                      key={m.id}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] ${
                        m.id === currentModel
                          ? 'bg-blue-600 text-white font-semibold'
                          : 'bg-white text-slate-700 border border-slate-200'
                      }`}
                    >
                      {m.name}
                    </span>
                  ))}
                </div>
              </div>

              {/* Nhập Key */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Gemini API Key
                  </label>
                  {fromEnv && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                      Đang đọc từ .env
                    </span>
                  )}
                </div>
                <div className="relative flex items-center">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Dán AIzaSy... của bạn vào đây"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 pr-20 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <div className="absolute right-2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className="rounded p-1 text-slate-400 hover:text-slate-600"
                      title={showKey ? 'Ẩn khóa' : 'Hiện khóa'}
                    >
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    {apiKey && (
                      <button
                        type="button"
                        onClick={handleClear}
                        className="rounded p-1 text-red-400 hover:text-red-600"
                        title="Xóa khóa"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  {fromEnv
                    ? 'Đã cấu hình trong .env. Bạn cũng có thể dán trực tiếp vào đây để ghi đè trên trình duyệt này.'
                    : 'Bạn có thể dán vào file .env (VITE_GEMINI_API_KEY) để lưu cố định trên máy tính.'}
                </p>
              </div>

              {testResult && (
                <div
                  className={`flex items-start gap-2.5 rounded-xl p-3 text-xs ${
                    testResult.success
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {testResult.success ? (
                    <Check className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                  )}
                  <span>{testResult.message}</span>
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={handleTest}
                disabled={testing || !apiKey.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
              >
                {testing ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 transition"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleSave();
                    setTimeout(() => setIsModalOpen(false), 500);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition"
                >
                  <Save className="h-3.5 w-3.5" />
                  Lưu & Áp dụng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
