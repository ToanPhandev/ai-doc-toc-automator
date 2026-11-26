import React from 'react';
import {
  BookOpenCheck,
  FileCheck2,
  FileText,
  Globe,
} from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

export const Header: React.FC = () => {
  const { language, toggleLanguage, t } = useLanguage();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs shadow-blue-600/20">
            <BookOpenCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                {t.header.title}
              </h1>
              <span className="hidden rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-600/20 sm:inline-flex">
                {t.header.badgeViEn}
              </span>
            </div>
            <p className="text-xs text-slate-500 sm:text-sm">
              {t.header.subtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Nút chuyển đổi ngôn ngữ Song ngữ Anh - Việt */}
          <button
            type="button"
            onClick={toggleLanguage}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:border-slate-300 hover:bg-slate-50"
            title={language === 'vi' ? 'Switch to English' : 'Chuyển sang Tiếng Việt'}
          >
            <Globe className="h-3.5 w-3.5 text-blue-600" />
            <span className="font-bold text-slate-900">
              {language === 'vi' ? 'EN' : 'VI'}
            </span>
          </button>

          <div className="hidden items-center gap-1.5 sm:flex">
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              <FileCheck2 className="h-3 w-3 text-blue-600" />
              {t.header.wordBadge}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
              <FileText className="h-3 w-3 text-rose-600" />
              {t.header.pdfBadge}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};
