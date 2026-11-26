# 📄 Doc TOC Automator Web

> **Ứng dụng Web tự động hóa tạo Mục lục & Đánh số trang chuẩn in ấn cho tài liệu Word (.docx, .doc) và PDF — Tích hợp Google Gemini AI.**

[![React](https://img.shields.io/badge/React-18.3-61dafb.svg?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4-646cff.svg?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4-38bdf8.svg?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Gemini AI](https://img.shields.io/badge/Google%20Gemini-AI%20Powered-4285F4.svg?logo=google&logoColor=white)](https://aistudio.google.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 🌟 Điểm nổi bật (Highlights)

- 🔒 **100% Bảo mật & Chạy Client-side**: Toàn bộ quá trình đọc, bóc tách và tạo file Word/PDF diễn ra trực tiếp ngay trên trình duyệt của người dùng. Tài liệu không bao giờ bị tải lên bất kỳ máy chủ trung gian nào.
- ⚡ **Auto-Run — Thả là chạy**: Kéo thả tệp đơn lẻ hoặc xử lý hàng loạt (Batch Processing). Hệ thống tự nhận diện loại file, chạy toàn bộ tiến trình và xuất file tức thì.
- 🤖 **Trí tuệ nhân tạo Gemini AI**: Nhận diện thông minh tên văn bản (Nghị định, Quyết định, Luật, Thông tư...), quét đề mục từ các bản PDF scan/ảnh hoặc văn bản không chuẩn định dạng.
- 📐 **Quy chuẩn Mục lục chuẩn in ấn**:
  - Font chuẩn Unicode (Times New Roman / Serif), cỡ chữ 13pt – 14pt.
  - Đường chấm bi dẫn dòng (*Tab Leader `..........`*) căn thẳng hàng tuyệt đối với số trang ở mép phải.
  - Tự động ghép nối tiêu đề bị ngắt dòng (*Title Merging* - ví dụ: "CHƯƠNG I" + "QUY ĐỊNH CHUNG" ➔ "CHƯƠNG I: QUY ĐỊNH CHUNG").
- 🛠️ **Bộ chỉnh sửa trực quan (TOC Inspector)**: Cho phép xem lại, điều chỉnh tiêu đề, cấp độ đề mục (Level 1, Level 2, Level 3) và số trang trước khi xuất file.
- 📱 **Hỗ trợ đa nền tảng**: Giao diện Responsive hoạt động mượt mà trên cả Máy tính (Desktop) và Điện thoại (Mobile).

---

## 🚀 Hai Luồng Xử Lý Chuyên Biệt

| Luồng | Định dạng đầu vào | Quy trình tự động | File kết quả tải về |
| :--- | :--- | :--- | :--- |
| **Luồng A** | **Word** (`.docx`, `.doc`) | 1. Đọc cấu trúc XML file Word.<br>2. Nhận diện đề mục nhiều cấp + Ghép dòng bị ngắt.<br>3. Chèn trang Mục lục tự động chuẩn ở Trang 1 + Page Break.<br>4. Đánh số trang chân trang giữa (*Footer - Center*).<br>5. Xuất bản PDF in ấn hoàn chỉnh. | • `<Tên_gốc>_muc_luc.docx`<br>• `<Tên_gốc> (in ấn).pdf` |
| **Luồng B** | **PDF** (`.pdf`) | 1. Quét thông minh vùng Header & Footer (9% lề trên/dưới):<br>   - *Nếu đã có số trang*: Giữ nguyên 100% bố cục gốc.<br>   - *Nếu chưa có*: Đóng dấu số trang tự động chuẩn.<br>2. Dựng trang Mục lục độc lập chuẩn kích thước trang gốc.<br>3. Ghép nối tự động trang Mục lục vào đầu văn bản. | • `[Mục Lục] <Tên_gốc>.docx`<br>• `[Mục Lục] <Tên_gốc>.pdf`<br>• `<Tên_gốc> (in ấn).pdf` |

---

## 🛠️ Công Nghệ Sử Dụng (Tech Stack)

- **Frontend Core**: [React 18](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/)
- **UI & Icons**: [Tailwind CSS](https://tailwindcss.com/), [Lucide React](https://lucide.dev/)
- **Xử lý tài liệu Word**: [docx](https://docx.js.org/), [jszip](https://stuk.github.io/jszip/)
- **Xử lý & Kết xuất PDF**: [pdf-lib](https://pdf-lib.js.org/), [@pdf-lib/fontkit](https://github.com/Hopding/fontkit), [pdfjs-dist](https://mozilla.github.io/pdf.js/)
- **Trí tuệ nhân tạo (AI)**: [Google Gemini API](https://ai.google.dev/) (`gemini-2.5-flash`, `gemini-3.8-flash`)

---

## 💻 Cài Đặt & Chạy Thử (Getting Started)

### Yêu cầu môi trường
- [Node.js](https://nodejs.org/) (Phiên bản 18 trở lên)
- Trình quản lý gói: `npm`, `yarn` hoặc `pnpm`

### Các bước cài đặt

1. **Clone repository về máy:**
   ```bash
   git clone <REPO_URL>
   cd Page
   ```

2. **Cài đặt các thư viện phụ thuộc:**
   ```bash
   npm install
   ```

3. **Cấu hình biến môi trường:**
   Tạo tệp `.env` từ tệp `.env.example`:
   ```bash
   cp .env.example .env
   ```
   Mở tệp `.env` và điền Google Gemini API Key của bạn (nhận miễn phí tại [Google AI Studio](https://aistudio.google.com/app/apikey)):
   ```env
   VITE_GEMINI_API_KEY=your_gemini_api_key_here
   VITE_GEMINI_MODEL=gemini-2.5-flash
   ```

4. **Khởi chạy ứng dụng ở chế độ phát triển (Dev):**
   ```bash
   npm run dev
   ```
   Mở trình duyệt và truy cập: `http://localhost:5173`

5. **Build cho môi trường Production:**
   ```bash
   npm run build
   ```

---

## 📂 Cấu Trúc Dự Án (Project Structure)

```text
├── src/
│   ├── components/            # Giao diện thành phần (Header, Dropzone, JobCard, Modals...)
│   │   ├── Header.tsx         # Thanh điều hướng và nút tải ZIP
│   │   ├── JobCard.tsx        # Khối hiển thị tiến trình và kết quả từng tệp
│   │   ├── UploadDropzone.tsx # Khu vực kéo thả tệp tải lên
│   │   ├── TocInspectorModal.tsx # Hộp thoại xem và sửa đề mục
│   │   └── PdfPreviewModal.tsx   # Hộp thoại xem trước PDF
│   ├── config/
│   │   └── aiConfig.ts        # Cấu hình kết nối Google Gemini API
│   ├── types/
│   │   └── toc.ts             # Định nghĩa Type TypeScript cho TOC, Heading, Jobs
│   ├── utils/
│   │   ├── docxBuilder.ts     # Trình tạo file Word (.docx) chuyên nghiệp
│   │   ├── fontLoader.ts      # Bộ nạp phông chữ Unicode cho PDF
│   │   ├── headingParser.ts   # Thuật toán bóc tách đề mục & định dạng tiêu đề
│   │   ├── llmTocService.ts   # Xử lý phân tích tài liệu bằng Gemini AI
│   │   ├── pdfProcessor.ts    # Luồng xử lý phân tích & đánh số trang PDF
│   │   ├── pdfRenderer.ts     # Dựng trang PDF mục lục & kết xuất
│   │   └── wordProcessor.ts   # Luồng xử lý phân tích tài liệu Word
│   ├── App.tsx                # Ứng dụng chính & bộ điều phối tiến trình
│   └── main.tsx               # Điểm khởi tạo ứng dụng React
├── doc_toc_automator/         # Phiên bản mã nguồn Python xử lý tự động
├── public/                    # Tài nguyên tĩnh
├── .env.example               # Tệp mẫu cấu hình môi trường
├── index.html                 # Template HTML
├── package.json               # Cấu hình gói & script npm
├── tailwind.config.js         # Cấu hình Tailwind CSS
└── vite.config.ts             # Cấu hình Vite
```

---

## 🚢 Hướng Dẫn Triển Khai (Deployment)

Dự án có thể dễ dàng triển khai lên các nền tảng máy chủ tĩnh (Static Hosting) như **Vercel**, **Netlify**, hoặc **GitHub Pages**:

### Triển khai lên Vercel
1. Kết nối repository GitHub này với tài khoản Vercel của bạn.
2. Thêm biến môi trường trong phần **Environment Variables**:
   - `VITE_GEMINI_API_KEY`: Khóa Gemini API của bạn.
   - `VITE_GEMINI_MODEL`: `gemini-2.5-flash`
3. Nhấn **Deploy** — Vercel sẽ tự động build và xuất bản trang web.

---

## 🤝 Đóng Góp (Contributing)

Mọi đóng góp nhằm cải thiện ứng dụng đều được hoan nghênh!
1. Fork dự án
2. Tạo nhánh tính năng mới (`git checkout -b feature/tinh-nang-moi`)
3. Commit các thay đổi của bạn (`git commit -m 'feat: Thêm tính năng mới'`)
4. Push lên nhánh (`git push origin feature/tinh-nang-moi`)
5. Tạo một Pull Request mới

---

## 📄 Giấy phép (License)

Dự án được phân phối dưới giấy phép **MIT License**. Xem chi tiết tại tệp `LICENSE` (nếu có).
