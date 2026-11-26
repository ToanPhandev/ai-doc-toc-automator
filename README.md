# AI Doc TOC Automator

> Ứng dụng web tự động hóa tạo Mục lục và Đánh số trang chuẩn in ấn cho tài liệu Word (.docx, .doc) và PDF, tích hợp Google Gemini AI.

[![React](https://img.shields.io/badge/React-18.3-61dafb.svg?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4-646cff.svg?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4-38bdf8.svg?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Gemini AI](https://img.shields.io/badge/Google%20Gemini-AI%20Powered-4285F4.svg?logo=google&logoColor=white)](https://aistudio.google.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Giới thiệu tổng quan

**AI Doc TOC Automator** giải quyết bài toán tốn nhiều thời gian và dễ sai lệch khi định dạng mục lục hoặc đánh số trang thủ công cho các văn bản tài liệu dài. Toàn bộ quá trình bóc tách cấu trúc tài liệu, tính toán số trang và kết xuất file diễn ra trực tiếp ngay trên trình duyệt (Client-side), đảm bảo tốc độ cao và bảo mật dữ liệu tuyệt đối.

---

## Tính năng nổi bật

- **Xử lý phía Client (100% Client-side)**: Tài liệu được xử lý trực tiếp trên trình duyệt bằng Web APIs và JavaScript. Dữ liệu không gửi lên máy chủ trung gian.
- **Tự động nhận diện và phân luồng**: Kéo thả tệp đơn lẻ hoặc nhiều tệp cùng lúc (Batch Processing), hệ thống tự động chạy toàn bộ quy trình và xuất kết quả.
- **Trí tuệ nhân tạo Gemini AI**: Nhận diện chuẩn xác loại văn bản (Nghị định, Quyết định, Luật, Thông tư...) và quét cấu trúc đề mục từ văn bản scan/ảnh hoặc tài liệu chưa định dạng style.
- **Định dạng mục lục chuẩn in ấn**:
  - Phông chữ tiêu chuẩn Unicode (Times New Roman / Serif), cỡ chữ 13pt – 14pt.
  - Dải chấm bi dẫn dòng (Tab Leader) căn thẳng hàng tuyệt đối với số trang ở mép phải.
  - Thuật toán ghép dòng tiêu đề bị ngắt dòng (Title Merging).
- **Bộ kiểm tra mục lục trực quan (TOC Inspector)**: Cho phép người dùng xem lại, sửa tiêu đề, đổi cấp độ đề mục (Level 1, Level 2, Level 3) và số trang trước khi xuất bản.
- **Xem trước và tải về linh hoạt**: Hỗ trợ xem trước PDF tích hợp sẵn, tải từng tệp riêng lẻ hoặc đóng gói toàn bộ thành một tệp ZIP duy nhất.
- **Tương thích đa thiết bị**: Giao diện Responsive hoạt động đồng bộ trên cả máy tính (Desktop) và điện thoại (Mobile).

---

## Luồng xử lý chi tiết

| Luồng | Định dạng đầu vào | Quy trình tự động | Tệp đầu ra tải về |
| :--- | :--- | :--- | :--- |
| **Luồng A** | Word (`.docx`, `.doc`) | 1. Phân tích cấu trúc XML của file Word.<br>2. Nhận diện đề mục đa cấp và ghép nối tiêu đề bị ngắt dòng.<br>3. Chèn trang Mục lục tự động chuẩn ở trang 1 và ngắt trang.<br>4. Đánh số trang căn giữa ở chân trang (Footer - Center).<br>5. Kết xuất bản PDF in ấn hoàn chỉnh. | • `<Tên_gốc>_muc_luc.docx`<br>• `<Tên_gốc> (in ấn).pdf` |
| **Luồng B** | PDF (`.pdf`) | 1. Phân tích vùng Header & Footer (9% lề trên/dưới):<br>   - Giữ nguyên số trang gốc nếu văn bản đã có số trang.<br>   - Tự động đóng dấu số trang liên tục nếu chưa có.<br>2. Dựng trang Mục lục độc lập chuẩn kích thước khổ giấy gốc.<br>3. Ghép nối tự động trang Mục lục vào đầu văn bản. | • `[Mục Lục] <Tên_gốc>.docx`<br>• `[Mục Lục] <Tên_gốc>.pdf`<br>• `<Tên_gốc> (in ấn).pdf` |

---

## Công nghệ sử dụng

- **Frontend Core**: React 18, TypeScript, Vite
- **Giao diện & Thành phần**: Tailwind CSS, Lucide React
- **Xử lý tài liệu Word**: docx, jszip
- **Xử lý & Kết xuất PDF**: pdf-lib, @pdf-lib/fontkit, pdfjs-dist
- **Mô hình trí tuệ nhân tạo**: Google Gemini API (`gemini-2.5-flash`, `gemini-3.8-flash`)

---

## Cài đặt và sử dụng

### Yêu cầu môi trường
- Node.js (phiên bản 18 trở lên)
- npm, yarn hoặc pnpm

### Các bước thiết lập

1. **Clone repository về máy**:
   ```bash
   git clone https://github.com/ToanPhandev/ai-doc-toc-automator.git
   cd ai-doc-toc-automator
   ```

2. **Cài đặt thư viện phụ thuộc**:
   ```bash
   npm install
   ```

3. **Cấu hình biến môi trường**:
   Tạo tệp `.env` tại thư mục gốc với nội dung:
   ```env
   VITE_GEMINI_API_KEY=khoa_api_gemini_cua_ban
   VITE_GEMINI_MODEL=gemini-2.5-flash
   ```
   *(Bạn có thể lấy Google Gemini API Key miễn phí tại [Google AI Studio](https://aistudio.google.com/app/apikey))*

4. **Chạy ứng dụng ở môi trường phát triển (Dev)**:
   ```bash
   npm run dev
   ```
   Truy cập trên trình duyệt: `http://localhost:5173`

5. **Build cho môi trường Production**:
   ```bash
   npm run build
   ```

---

## Cấu trúc thư mục

```text
├── src/
│   ├── components/            # Giao diện thành phần (Header, JobCard, Dropzone, Modals...)
│   │   ├── Header.tsx         # Thanh điều hướng và tác vụ tải file ZIP
│   │   ├── JobCard.tsx        # Trạng thái tiến trình và kết quả từng tệp
│   │   ├── UploadDropzone.tsx # Khu vực kéo thả tải file
│   │   ├── TocInspectorModal.tsx # Hộp thoại trực quan xem và sửa đề mục
│   │   └── PdfPreviewModal.tsx   # Hộp thoại xem trước PDF trực tiếp
│   ├── config/
│   │   └── aiConfig.ts        # Thiết lập kết nối Google Gemini API
│   ├── types/
│   │   └── toc.ts             # Định nghĩa Type TypeScript cho TOC và Jobs
│   ├── utils/
│   │   ├── docxBuilder.ts     # Trình tạo file Word (.docx) chuyên dụng
│   │   ├── fontLoader.ts      # Nạp phông chữ Unicode cho PDF
│   │   ├── headingParser.ts   # Thuật toán bóc tách đề mục và chuẩn hóa tiêu đề
│   │   ├── llmTocService.ts   # Xử lý nhận diện qua Gemini AI
│   │   ├── pdfProcessor.ts    # Phân tích và đánh số trang PDF
│   │   ├── pdfRenderer.ts     # Dựng trang PDF mục lục
│   │   └── wordProcessor.ts   # Xử lý tài liệu Word
│   ├── App.tsx                # Ứng dụng chính và điều phối tiến trình
│   └── main.tsx               # Điểm khởi tạo ứng dụng React
├── doc_toc_automator/         # Module mã nguồn Python xử lý tự động
├── public/                    # Tài nguyên tĩnh
├── index.html                 # Template HTML
├── package.json               # Cấu hình dự án và dependencies
├── tailwind.config.js         # Cấu hình Tailwind CSS
├── tsconfig.json              # Cấu hình TypeScript
├── vercel.json                # Cấu hình triển khai Vercel
└── vite.config.ts             # Cấu hình Vite
```

---

## Triển khai (Deployment)

Dự án được tối ưu hóa để triển khai trên các nền tảng máy chủ tĩnh như **Vercel**, **Netlify**, hoặc **GitHub Pages**.

### Triển khai trên Vercel
1. Kết nối repository GitHub này với tài khoản Vercel.
2. Thêm các biến môi trường trong phần **Environment Variables**:
   - `VITE_GEMINI_API_KEY`: API Key của Google Gemini.
   - `VITE_GEMINI_MODEL`: `gemini-2.5-flash`
3. Chọn **Deploy** — Vercel sẽ tự động kích hoạt tiến trình build và xuất bản trang web.

---

## Đóng góp phát triển

Mọi đóng góp nhằm tối ưu hóa và phát triển ứng dụng đều được hoan nghênh:
1. Fork repository
2. Tạo nhánh tính năng mới (`git checkout -b feature/ten-tinh-nang`)
3. Commit các thay đổi (`git commit -m "feat: Mô tả tính năng mới"`)
4. Đẩy mã nguồn lên nhánh (`git push origin feature/ten-tinh-nang`)
5. Tạo một Pull Request mới

---

## Giấy phép

Dự án được phát hành theo giấy phép [MIT License](https://opensource.org/licenses/MIT).
