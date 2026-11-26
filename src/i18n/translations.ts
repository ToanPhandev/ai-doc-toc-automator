export type Language = 'vi' | 'en';

export interface Translations {
  header: {
    title: string;
    subtitle: string;
    badgeViEn: string;
    wordBadge: string;
    pdfBadge: string;
  };
  dropzone: {
    dragDropTitle: string;
    dragDropSubtitle: string;
    autoRunNotice: string;
    sampleSectionTitle: string;
    sampleWordBtn: string;
    samplePdfNoNumBtn: string;
    samplePdfWithNumBtn: string;
    supportedFormatsNote: string;
  };
  jobCard: {
    wordBadge: string;
    pdfBadge: string;
    statusProcessing: string;
    statusDone: string;
    statusError: string;
    headingsCount: string;
    removeTooltip: string;
    inspectTocBtn: string;
    previewPdfBtn: string;
    downloadBtn: string;
    preservedPagesBadge: string;
    stampedPagesBadge: string;
    pagesSuffix: string;
  };
  tocModal: {
    title: string;
    docLabel: string;
    emptyNotice: string;
    level1Option: string;
    level2Option: string;
    titlePlaceholder: string;
    pageLabel: string;
    addHeadingBtn: string;
    saveChangesBtn: string;
    savingBtn: string;
    cancelBtn: string;
    deleteTooltip: string;
  };
  pdfModal: {
    previewPrefix: string;
    openNewTab: string;
    download: string;
    close: string;
  };
  app: {
    docListTitle: string;
    completedCount: string;
    downloadAllZip: string;
    zipping: string;
    clearList: string;
    zipFileName: string;
  };
}

export const translations: Record<Language, Translations> = {
  vi: {
    header: {
      title: 'AutoTOC & PageNumber',
      subtitle: 'Tự động tạo Mục lục chấm bi, bảo toàn định dạng & đổi tên thông minh',
      badgeViEn: 'VI / EN',
      wordBadge: 'Word (.docx)',
      pdfBadge: 'PDF',
    },
    dropzone: {
      dragDropTitle: 'Kéo thả tài liệu vào đây hoặc nhấn để chọn tệp',
      dragDropSubtitle: 'Hỗ trợ tệp đơn lẻ hoặc chọn cùng lúc nhiều tệp Word (.docx, .doc) & PDF (.pdf)',
      autoRunNotice: 'Tự động chạy toàn bộ quy trình ngay khi thả file',
      sampleSectionTitle: 'Thử nghiệm nhanh với dữ liệu mẫu:',
      sampleWordBtn: 'Mẫu Word (.docx)',
      samplePdfNoNumBtn: 'Mẫu PDF chưa có số trang',
      samplePdfWithNumBtn: 'Mẫu PDF đã có số trang',
      supportedFormatsNote: 'Định dạng hỗ trợ: Word (.docx, .doc) và PDF (.pdf). Khuyến nghị dung lượng dưới 100MB.',
    },
    jobCard: {
      wordBadge: 'Word',
      pdfBadge: 'PDF',
      statusProcessing: 'Đang xử lý...',
      statusDone: 'Hoàn tất',
      statusError: 'Lỗi xử lý',
      headingsCount: 'đề mục',
      removeTooltip: 'Xóa khỏi danh sách',
      inspectTocBtn: 'Xem / Sửa Mục lục',
      previewPdfBtn: 'Xem trước PDF in ấn',
      downloadBtn: 'Tải về',
      preservedPagesBadge: 'Giữ nguyên số trang gốc',
      stampedPagesBadge: 'Đóng dấu số trang chân trang',
      pagesSuffix: 'trang',
    },
    tocModal: {
      title: 'Chỉnh sửa danh sách Mục lục',
      docLabel: 'Tài liệu:',
      emptyNotice: 'Chưa có đề mục nào. Bấm "Thêm dòng đề mục" bên dưới để tạo mới.',
      level1Option: 'Cấp 1 (Chương / Phần)',
      level2Option: 'Cấp 2 (Mục / Điều)',
      titlePlaceholder: 'Nhập tiêu đề đề mục...',
      pageLabel: 'Trang',
      addHeadingBtn: 'Thêm dòng đề mục',
      saveChangesBtn: 'Lưu thay đổi',
      savingBtn: 'Đang tạo lại...',
      cancelBtn: 'Hủy bỏ',
      deleteTooltip: 'Xóa đề mục',
    },
    pdfModal: {
      previewPrefix: 'Xem trước:',
      openNewTab: 'Mở tab mới',
      download: 'Tải về',
      close: 'Đóng',
    },
    app: {
      docListTitle: 'Danh sách tài liệu',
      completedCount: 'hoàn tất',
      downloadAllZip: 'Tải trọn bộ tất cả (.ZIP)',
      zipping: 'Đang nén ZIP...',
      clearList: 'Xóa danh sách',
      zipFileName: 'Ket_Qua_Muc_Luc_In_An',
    },
  },
  en: {
    header: {
      title: 'AutoTOC & PageNumber',
      subtitle: 'Automated Tab Leader TOC, formatting preservation & smart naming',
      badgeViEn: 'EN / VI',
      wordBadge: 'Word (.docx)',
      pdfBadge: 'PDF',
    },
    dropzone: {
      dragDropTitle: 'Drag & drop documents here or click to browse',
      dragDropSubtitle: 'Supports single files or batch Word (.docx, .doc) & PDF (.pdf) documents',
      autoRunNotice: 'Automatically executes full workflow immediately upon file drop',
      sampleSectionTitle: 'Quickly test with sample documents:',
      sampleWordBtn: 'Sample Word (.docx)',
      samplePdfNoNumBtn: 'Sample PDF without page numbers',
      samplePdfWithNumBtn: 'Sample PDF with existing page numbers',
      supportedFormatsNote: 'Supported formats: Word (.docx, .doc) and PDF (.pdf). Recommended size under 100MB.',
    },
    jobCard: {
      wordBadge: 'Word',
      pdfBadge: 'PDF',
      statusProcessing: 'Processing...',
      statusDone: 'Completed',
      statusError: 'Processing Error',
      headingsCount: 'headings',
      removeTooltip: 'Remove from list',
      inspectTocBtn: 'Inspect / Edit TOC',
      previewPdfBtn: 'Preview Print PDF',
      downloadBtn: 'Download',
      preservedPagesBadge: 'Retained original page numbers',
      stampedPagesBadge: 'Stamped footer page numbers',
      pagesSuffix: 'pages',
    },
    tocModal: {
      title: 'Edit Table of Contents',
      docLabel: 'Document:',
      emptyNotice: 'No headings found. Click "Add new heading" below to create one.',
      level1Option: 'Level 1 (Chapter / Part)',
      level2Option: 'Level 2 (Section / Article)',
      titlePlaceholder: 'Enter heading title...',
      pageLabel: 'Page',
      addHeadingBtn: 'Add new heading',
      saveChangesBtn: 'Save changes',
      savingBtn: 'Rebuilding...',
      cancelBtn: 'Cancel',
      deleteTooltip: 'Remove heading',
    },
    pdfModal: {
      previewPrefix: 'Preview:',
      openNewTab: 'Open in new tab',
      download: 'Download',
      close: 'Close',
    },
    app: {
      docListTitle: 'Documents List',
      completedCount: 'completed',
      downloadAllZip: 'Download All (.ZIP)',
      zipping: 'Compressing ZIP...',
      clearList: 'Clear List',
      zipFileName: 'Print_TOC_Results',
    },
  },
};
