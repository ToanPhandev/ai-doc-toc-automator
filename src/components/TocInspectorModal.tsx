import React, { useState } from 'react';
import { Plus, Save, Trash2, X } from 'lucide-react';
import { HeadingItem, ProcessedJob } from '../types/toc';

interface TocInspectorModalProps {
  job: ProcessedJob;
  onClose: () => void;
  onSaveHeadings: (jobId: string, updatedHeadings: HeadingItem[]) => Promise<void>;
}

export const TocInspectorModal: React.FC<TocInspectorModalProps> = ({
  job,
  onClose,
  onSaveHeadings,
}) => {
  const [items, setItems] = useState<HeadingItem[]>(() =>
    job.headings.map((h) => ({ ...h }))
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleTitleChange = (idx: number, value: string) => {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, title: value } : item))
    );
  };

  const handleLevelChange = (idx: number, level: 1 | 2) => {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, level } : item))
    );
  };

  const handlePageChange = (idx: number, pageStr: string) => {
    const num = Math.max(1, parseInt(pageStr, 10) || 1);
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, pageNumber: num } : item))
    );
  };

  const handleRemove = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAdd = () => {
    const lastPage = items.length > 0 ? items[items.length - 1].pageNumber : 1;
    setItems((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}`,
        level: 1,
        title: 'CHƯƠNG MỚI: TIÊU ĐỀ ĐỀ MỤC',
        pageNumber: lastPage,
      },
    ]);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const cleaned = items
        .map((it) => ({ ...it, title: it.title.trim() }))
        .filter((it) => it.title.length > 0);
      await onSaveHeadings(job.id, cleaned);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-xs sm:p-6">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5 sm:px-6">
          <div>
            <h3 className="text-base font-bold text-slate-900 sm:text-lg">
              Chỉnh sửa danh sách Mục lục
            </h3>
            <p className="text-xs text-slate-500">
              Tài liệu: <span className="font-semibold text-slate-700">{job.baseName}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Danh sách các dòng đề mục */}
        <div className="flex-1 space-y-2.5 overflow-y-auto p-4 sm:p-6">
          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Chưa có đề mục nào. Bấm &ldquo;Thêm dòng đề mục&rdquo; bên dưới để tạo mới.
            </p>
          ) : (
            items.map((item, idx) => (
              <div
                key={item.id}
                className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 sm:flex-row sm:items-center"
              >
                <div className="flex items-center gap-2">
                  <select
                    value={item.level}
                    onChange={(e) =>
                      handleLevelChange(idx, Number(e.target.value) as 1 | 2)
                    }
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-none"
                  >
                    <option value={1}>Cấp 1 (CHƯƠNG/PHẦN)</option>
                    <option value={2}>Cấp 2 (MỤC/ĐIỀU)</option>
                  </select>

                  <div className="flex items-center gap-1 sm:hidden">
                    <span className="text-xs text-slate-500">Trang:</span>
                    <input
                      type="number"
                      min={1}
                      value={item.pageNumber}
                      onChange={(e) => handlePageChange(idx, e.target.value)}
                      className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1 text-center text-xs font-semibold text-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemove(idx)}
                      className="ml-auto rounded-lg p-1.5 text-rose-500 hover:bg-rose-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <input
                  type="text"
                  value={item.title}
                  onChange={(e) => handleTitleChange(idx, e.target.value)}
                  placeholder="Nhập tên đề mục..."
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 focus:border-blue-500 focus:outline-none sm:text-sm"
                />

                <div className="hidden items-center gap-2 sm:flex">
                  <span className="text-xs font-medium text-slate-500">Trang</span>
                  <input
                    type="number"
                    min={1}
                    value={item.pageNumber}
                    onChange={(e) => handlePageChange(idx, e.target.value)}
                    className="w-16 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-center text-xs font-bold text-slate-900 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemove(idx)}
                    title="Xóa dòng này"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}

          <button
            type="button"
            onClick={handleAdd}
            className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-dashed border-blue-400 bg-blue-50/50 px-3.5 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-100/60"
          >
            <Plus className="h-4 w-4" />
            Thêm dòng đề mục
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/70 sm:text-sm"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50 sm:text-sm"
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Đang cập nhật file...' : 'Lưu & Tạo lại File Đầu Ra'}
          </button>
        </div>
      </div>
    </div>
  );
};
