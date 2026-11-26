import React, { useState } from 'react';
import { Plus, Save, Trash2, X } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';
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
  const { t } = useLanguage();
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
        title: 'NEW CHAPTER: SECTION TITLE',
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
              {t.tocModal.title}
            </h3>
            <p className="text-xs text-slate-500">
              {t.tocModal.docLabel} <span className="font-semibold text-slate-700">{job.baseName}</span>
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
              {t.tocModal.emptyNotice}
            </p>
          ) : (
            items.map((item, idx) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-2.5 transition hover:bg-slate-50 sm:flex-nowrap"
              >
                {/* Chọn Cấp độ */}
                <select
                  value={item.level}
                  onChange={(e) =>
                    handleLevelChange(idx, Number(e.target.value) as 1 | 2)
                  }
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-none"
                >
                  <option value={1}>{t.tocModal.level1Option}</option>
                  <option value={2}>{t.tocModal.level2Option}</option>
                </select>

                {/* Ô nhập tiêu đề */}
                <input
                  type="text"
                  value={item.title}
                  onChange={(e) => handleTitleChange(idx, e.target.value)}
                  placeholder={t.tocModal.titlePlaceholder}
                  className={`flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none sm:text-sm ${
                    item.level === 1 ? 'font-bold' : 'font-normal'
                  }`}
                />

                {/* Ô nhập số trang */}
                <div className="flex items-center gap-1">
                  <span className="text-[11px] font-medium text-slate-500">
                    {t.tocModal.pageLabel}
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={item.pageNumber}
                    onChange={(e) => handlePageChange(idx, e.target.value)}
                    className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-xs font-bold tabular-nums text-slate-900 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {/* Nút xóa */}
                <button
                  type="button"
                  onClick={() => handleRemove(idx)}
                  title={t.tocModal.deleteTooltip}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/80 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={handleAdd}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-100"
          >
            <Plus className="h-3.5 w-3.5" />
            {t.tocModal.addHeadingBtn}
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60"
            >
              {t.tocModal.cancelBtn}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              {isSaving ? t.tocModal.savingBtn : t.tocModal.saveChangesBtn}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
