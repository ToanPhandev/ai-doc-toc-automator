# AI Doc TOC Automator

> Automated web application for generating Table of Contents (TOC) and print-ready page numbering for Word (.docx, .doc) and PDF documents, powered by Google Gemini AI.

[![React](https://img.shields.io/badge/React-18.3-61dafb.svg?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4-646cff.svg?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.4-38bdf8.svg?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Gemini AI](https://img.shields.io/badge/Google%20Gemini-AI%20Powered-4285F4.svg?logo=google&logoColor=white)](https://aistudio.google.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Overview

Formatting a Table of Contents and adjusting page numbers manually for lengthy documents is repetitive and prone to pagination errors. **AI Doc TOC Automator** solves this completely within the client browser. Document structure parsing, page calculation, and output rendering run 100% on the client side using Web APIs, ensuring high processing speed and strict data privacy.

---

## Key Features

- **100% Client-Side Processing**: Documents are read, parsed, and generated directly inside the browser using JavaScript and Web APIs. No document files are ever uploaded to any intermediary backend server.
- **Drag & Drop Auto-Run**: Supports single files or batch processing. Dropping files immediately triggers automated routing, heading detection, and rendering.
- **Bilingual Interface (English & Vietnamese)**: Instant one-click language toggle across the entire web interface, with persistent user preferences.
- **Google Gemini AI Integration**: Automatically recognizes document titles (Decisions, Decrees, Acts, Circulars, Regulations) and detects heading hierarchies in scanned or non-standard documents.
- **Print-Standard Table of Contents**:
  - Unicode typography (Times New Roman / Serif), 13pt – 14pt.
  - Tab Leaders (`..........`) strictly aligned to the right-hand margin with page numbers.
  - Automatic Title Merging for broken line titles (e.g., "CHAPTER I" + "GENERAL PROVISIONS" ➔ "CHAPTER I: GENERAL PROVISIONS").
- **Interactive TOC Inspector**: Review, adjust levels (Level 1, Level 2, Level 3), edit titles, and modify page numbers before exporting.
- **Integrated PDF Preview**: Inspect generated PDFs directly in the browser or download individual files and complete ZIP archives.
- **Responsive Design**: Full feature parity across desktop and mobile devices.

---

## Processing Pipelines

| Pipeline | Input Format | Automated Workflow | Generated Outputs |
| :--- | :--- | :--- | :--- |
| **Flow A** | Word (`.docx`, `.doc`) | 1. Parse XML structure.<br>2. Detect multi-level headings and merge split titles.<br>3. Insert standard TOC on Page 1 with page break.<br>4. Center-align page numbers in footer.<br>5. Render print-ready PDF. | • `<Base_Name>_muc_luc.docx`<br>• `<Base_Name> (in ấn).pdf` |
| **Flow B** | PDF (`.pdf`) | 1. Scan header & footer zones (9% top/bottom):<br>   - Retain 100% of existing page numbers if present.<br>   - Apply continuous page numbers if absent.<br>2. Generate standalone TOC matching source page dimensions.<br>3. Prepend TOC pages before Page 1 of the original PDF. | • `[Mục Lục] <Base_Name>.docx`<br>• `[Mục Lục] <Base_Name>.pdf`<br>• `<Base_Name> (in ấn).pdf` |

---

## Tech Stack

- **Frontend Core**: React 18, TypeScript, Vite
- **UI & Styling**: Tailwind CSS, Lucide React
- **Word Processing**: docx, jszip
- **PDF Engine**: pdf-lib, @pdf-lib/fontkit, pdfjs-dist
- **AI Models**: Google Gemini API (`gemini-2.5-flash`, `gemini-3.8-flash`)

---

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm, yarn, or pnpm

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/ToanPhandev/ai-doc-toc-automator.git
   cd ai-doc-toc-automator
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   Create a `.env` file in the root directory:
   ```env
   VITE_GEMINI_API_KEY=your_gemini_api_key_here
   VITE_GEMINI_MODEL=gemini-2.5-flash
   ```
   *(Obtain a free Google Gemini API key at [Google AI Studio](https://aistudio.google.com/app/apikey))*

4. **Start the development server**:
   ```bash
   npm run dev
   ```
   Open your browser at: `http://localhost:5173`

5. **Build for production**:
   ```bash
   npm run build
   ```

---

## Project Structure

```text
├── src/
│   ├── components/            # UI Components (Header, JobCard, Dropzone, Modals...)
│   │   ├── Header.tsx         # Navigation bar, language switch, AI settings
│   │   ├── JobCard.tsx        # File processing progress and output downloads
│   │   ├── UploadDropzone.tsx # Drag & drop file upload area with sample files
│   │   ├── TocInspectorModal.tsx # Interactive TOC editor modal
│   │   └── PdfPreviewModal.tsx   # In-app PDF viewer modal
│   ├── config/
│   │   └── aiConfig.ts        # Google Gemini API configuration
│   ├── i18n/
│   │   ├── translations.ts    # English & Vietnamese translation dictionaries
│   │   └── LanguageContext.tsx# Language state provider and hook
│   ├── types/
│   │   └── toc.ts             # TypeScript definitions for TOC, Headings, and Jobs
│   ├── utils/
│   │   ├── docxBuilder.ts     # Word (.docx) builder with TOC & Tab Leaders
│   │   ├── fontLoader.ts      # Unicode font loader for PDF rendering
│   │   ├── headingParser.ts   # Heading extraction and smart title formatting
│   │   ├── llmTocService.ts   # Document analysis service via Gemini AI
│   │   ├── pdfProcessor.ts    # PDF analysis and page numbering pipeline
│   │   ├── pdfRenderer.ts     # PDF TOC page rendering
│   │   └── wordProcessor.ts   # Word document processing pipeline
│   ├── App.tsx                # Main application orchestrator
│   └── main.tsx               # React application entry point
├── doc_toc_automator/         # Python automation module
├── public/                    # Static assets
├── index.html                 # HTML template
├── package.json               # Package configuration and dependencies
├── tailwind.config.js         # Tailwind CSS configuration
├── tsconfig.json              # TypeScript configuration
├── vercel.json                # Vercel deployment configuration
└── vite.config.ts             # Vite configuration
```

---

## Deployment

The application is optimized for static hosting platforms such as **Vercel**, **Netlify**, or **GitHub Pages**.

### Deploy on Vercel
1. Connect this repository to your Vercel account.
2. In the **Environment Variables** section, configure:
   - `VITE_GEMINI_API_KEY`: Your Gemini API Key.
   - `VITE_GEMINI_MODEL`: `gemini-2.5-flash`
3. Click **Deploy** — Vercel will build and publish the site automatically.

---

## Contributing

Contributions to improve features and performance are welcome:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m "feat: Add new capability"`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

---

## License

This project is licensed under the [MIT License](https://opensource.org/licenses/MIT).
