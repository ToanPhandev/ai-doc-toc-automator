export type Language = 'vi' | 'en';

export interface Translations {
  header: {
    title: string;
    subtitle: string;
    aiActive: string;
    aiInactive: string;
    aiActiveShort: string;
    aiInactiveShort: string;
    badgeViEn: string;
    wordBadge: string;
    pdfBadge: string;
    aiModalTitle: string;
    aiModalSubtitle: string;
    activeModelLabel: string;
    modelCodeNote: string;
    apiKeyLabel: string;
    apiKeyPlaceholder: string;
    apiKeyFromEnv: string;
    apiKeyFromStorage: string;
    testConnection: string;
    testing: string;
    saveConfig: string;
    clearKey: string;
    saveSuccessActive: string;
    saveSuccessLocal: string;
    clearSuccess: string;
    testEmptyNotice: string;
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
    flowA: string;
    flowB: string;
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
    flowABoxTitle: string;
    flowABoxPoint1: string;
    flowABoxPoint2: string;
    flowABoxPoint3: string;
    flowABoxPoint4: string;
    flowBBoxTitle: string;
    flowBBoxPoint1: string;
    flowBBoxPoint2: string;
    flowBBoxPoint3: string;
    flowBBoxPoint4: string;
  };
}

export const translations: Record<Language, Translations> = {
  vi: {
    header: {
      title: 'AutoTOC & PageNumber',
      subtitle: 'Tự động tạo Mục lục chấm bi, bảo toàn định dạng & đổi tên thông minh',
      aiActive: 'AI',
      aiInactive: 'Cục bộ (Chưa có Key)',
      aiActiveShort: 'AI Bật',
      aiInactiveShort: 'Cài Key',
      badgeViEn: 'VI / EN',
      wordBadge: 'Word (.docx)',
      pdfBadge: 'PDF',
      aiModalTitle: 'Cấu hình Google Gemini AI',
      aiModalSubtitle: 'Chọn mô hình & cấu hình API Key trực tiếp qua .env hoặc giao diện',
      activeModelLabel: 'Mô hình đang hoạt động:',
      modelCodeNote: 'Bạn có thể đổi mô hình trực tiếp qua biến VITE_GEMINI_MODEL trong file .env hoặc cấu hình code.',
      apiKeyLabel: 'Khóa Google Gemini API Key:',
      apiKeyPlaceholder: 'Dán mã API Key của bạn (bắt đầu bằng AIza...)',
      apiKeyFromEnv: 'Đang sử dụng API Key từ tệp .env (Ưu tiên cao nhất)',
      apiKeyFromStorage: 'API Key được lưu bảo mật trong trình duyệt (localStorage), không gửi đi đâu khác.',
      testConnection: 'Kiểm tra kết nối',
      testing: 'Đang kiểm tra...',
      saveConfig: 'Lưu cấu hình',
      clearKey: 'Xóa Key',
      saveSuccessActive: 'Đã lưu khóa API Gemini thành công!',
      saveSuccessLocal: 'Đã xóa khóa API (Chuyển sang chế độ Cục bộ).',
      clearSuccess: 'Đã xóa khóa API. Hệ thống sẽ hoạt động ở chế độ Cục bộ (Offline).',
      testEmptyNotice: 'Vui lòng nhập API key trước khi kiểm tra.',
    },
    dropzone: {
      dragDropTitle: 'Kéo thả tài liệu vào đây hoặc nhấn để chọn tệp',
      dragDropSubtitle: 'Hỗ trợ tệp đơn lẻ hoặc chọn cùng lúc nhiều tệp Word (.docx, .doc) & PDF (.pdf)',
      autoRunNotice: 'Tự động chạy toàn bộ quy trình ngay khi thả file',
      sampleSectionTitle: 'Hoặc thử nghiệm nhanh với dữ liệu mẫu chuẩn:',
      sampleWordBtn: 'Mẫu 1: Văn bản Word (.docx)',
      samplePdfNoNumBtn: 'Mẫu 2: PDF chưa có số trang',
      samplePdfWithNumBtn: 'Mẫu 3: PDF đã có số trang',
      supportedFormatsNote: 'Định dạng hỗ trợ: Word (.docx, .doc) và PDF (.pdf). Khuyến nghị dung lượng dưới 100MB.',
    },
    jobCard: {
      flowA: 'Luồng A • Word',
      flowB: 'Luồng B • PDF',
      statusProcessing: 'Đang xử lý...',
      statusDone: 'Hoàn tất',
      statusError: 'Lỗi xử lý',
      headingsCount: 'đề mục',
      removeTooltip: 'Xóa khỏi danh sách',
      inspectTocBtn: 'Xem / Sửa Mục lục',
      previewPdfBtn: 'Xem trước PDF',
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
      flowABoxTitle: 'LUỒNG A: Tệp Word (.doc / .docx)',
      flowABoxPoint1: 'Nhận diện đề mục Cấp 1 & Cấp 2 (VI/EN) + Ghép dòng tiêu đề bị ngắt.',
      flowABoxPoint2: 'Chèn trang Mục lục chuẩn Times New Roman ở Trang 1, đẩy nội dung gốc sang Trang 2.',
      flowABoxPoint3: 'Đánh số trang tự động liên tục từ 1 ở Chính giữa chân trang (Footer - Center).',
      flowABoxPoint4: 'Xuất 2 tệp: <Base_Name>_muc_luc.docx và <Base_Name> (in ấn).pdf.',
      flowBBoxTitle: 'LUỒNG B: Tệp PDF (.pdf có chữ ký / con dấu)',
      flowBBoxPoint1: 'Quét vùng Header/Footer: Nếu đã có sẵn số trang sẽ giữ nguyên 100%; nếu chưa có sẽ tự đánh số từ 1 ở giữa Footer.',
      flowBBoxPoint2: 'Tạo mục lục rời Tab Leader chấm bi (.........), không đánh số trang trên tệp mục lục.',
      flowBBoxPoint3: 'Nối trang Mục lục lên trước trang 1 của PDF gốc, bảo toàn 100% vector & con dấu đỏ.',
      flowBBoxPoint4: 'Xuất 3 tệp: [Mục Lục] <Base_Name>.docx, [Mục Lục] <Base_Name>.pdf và <Base_Name> (in ấn).pdf.',
    },
  },
  en: {
    header: {
      title: 'AutoTOC & PageNumber',
      subtitle: 'Automated Tab Leader TOC, formatting preservation & smart naming',
      aiActive: 'AI',
      aiInactive: 'Local (No Key)',
      aiActiveShort: 'AI On',
      aiInactiveShort: 'Set Key',
      badgeViEn: 'EN / VI',
      wordBadge: 'Word (.docx)',
      pdfBadge: 'PDF',
      aiModalTitle: 'Google Gemini AI Configuration',
      aiModalSubtitle: 'Select model & configure API Key directly via .env or web interface',
      activeModelLabel: 'Active model:',
      modelCodeNote: 'You can change the active model via VITE_GEMINI_MODEL in your .env file or code config.',
      apiKeyLabel: 'Google Gemini API Key:',
      apiKeyPlaceholder: 'Paste your API Key here (starts with AIza...)',
      apiKeyFromEnv: 'Using API Key from .env file (Highest priority)',
      apiKeyFromStorage: 'API Key is stored securely in browser localStorage, never sent elsewhere.',
      testConnection: 'Test Connection',
      testing: 'Testing...',
      saveConfig: 'Save Configuration',
      clearKey: 'Clear Key',
      saveSuccessActive: 'Gemini API key saved successfully!',
      saveSuccessLocal: 'API key removed (Switched to Local mode).',
      clearSuccess: 'API key cleared. System will operate in Local (Offline) mode.',
      testEmptyNotice: 'Please enter an API key before testing.',
    },
    dropzone: {
      dragDropTitle: 'Drag & drop documents here or click to browse',
      dragDropSubtitle: 'Supports single files or batch Word (.docx, .doc) & PDF (.pdf) documents',
      autoRunNotice: 'Automatically executes full workflow immediately upon file drop',
      sampleSectionTitle: 'Or quickly test with standard sample documents:',
      sampleWordBtn: 'Sample 1: Word Document (.docx)',
      samplePdfNoNumBtn: 'Sample 2: PDF without page numbers',
      samplePdfWithNumBtn: 'Sample 3: PDF with existing page numbers',
      supportedFormatsNote: 'Supported formats: Word (.docx, .doc) and PDF (.pdf). Recommended size under 100MB.',
    },
    jobCard: {
      flowA: 'Flow A • Word',
      flowB: 'Flow B • PDF',
      statusProcessing: 'Processing...',
      statusDone: 'Completed',
      statusError: 'Processing Error',
      headingsCount: 'headings',
      removeTooltip: 'Remove from list',
      inspectTocBtn: 'Inspect / Edit TOC',
      previewPdfBtn: 'Preview PDF',
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
      flowABoxTitle: 'FLOW A: Word Document (.doc / .docx)',
      flowABoxPoint1: 'Detects Level 1 & Level 2 headings (VI/EN) + Merges split title lines.',
      flowABoxPoint2: 'Inserts standard Times New Roman TOC on Page 1, pushes original content to Page 2.',
      flowABoxPoint3: 'Auto-numbers continuously from 1 at Footer - Center.',
      flowABoxPoint4: 'Exports 2 files: <Base_Name>_muc_luc.docx and <Base_Name> (in ấn).pdf.',
      flowBBoxTitle: 'FLOW B: PDF File (.pdf with signatures / stamps)',
      flowBBoxPoint1: 'Scans Header/Footer: Retains 100% of existing page numbers if present; auto-numbers from 1 at center footer if absent.',
      flowBBoxPoint2: 'Generates standalone Tab Leader TOC (.........), no page numbers on TOC pages.',
      flowBBoxPoint3: 'Prepends TOC pages before original PDF Page 1, preserving 100% vector & seal graphics.',
      flowBBoxPoint4: 'Exports 3 files: [Mục Lục] <Base_Name>.docx, [Mục Lục] <Base_Name>.pdf and <Base_Name> (in ấn).pdf.',
    },
  },
};
