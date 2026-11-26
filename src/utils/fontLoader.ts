import { PDFDocument, PDFFont, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

let cachedRegularBytes: ArrayBuffer | null = null;
let cachedBoldBytes: ArrayBuffer | null = null;

const REGULAR_FONT_URLS = [
  '/fonts/TimesNewRoman-Regular.ttf',
  'https://cdn.jsdelivr.net/gh/google/fonts@main/apache/tinos/Tinos-Regular.ttf',
  'https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSerif/NotoSerif-Regular.ttf',
];

const BOLD_FONT_URLS = [
  '/fonts/TimesNewRoman-Bold.ttf',
  'https://cdn.jsdelivr.net/gh/google/fonts@main/apache/tinos/Tinos-Bold.ttf',
  'https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSerif/NotoSerif-Bold.ttf',
];

async function fetchFirstAvailableFont(urls: string[]): Promise<ArrayBuffer | null> {
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('text/html')) continue;
      const buf = await res.arrayBuffer();
      if (buf.byteLength > 10000) {
        return buf;
      }
    } catch {
      // Thử URL kế tiếp
    }
  }
  return null;
}

export interface EmbeddedSerifFonts {
  regular: PDFFont;
  bold: PDFFont;
  isUnicode: boolean;
}

/**
 * Nhúng font Times New Roman / Tinos Serif hỗ trợ đầy đủ Unicode UTF-8 Tiếng Việt & Tiếng Anh vào PDFDocument.
 */
export async function embedVietnameseSerifFonts(
  pdfDoc: PDFDocument
): Promise<EmbeddedSerifFonts> {
  try {
    pdfDoc.registerFontkit(fontkit);

    if (!cachedRegularBytes) {
      cachedRegularBytes = await fetchFirstAvailableFont(REGULAR_FONT_URLS);
    }
    if (!cachedBoldBytes) {
      cachedBoldBytes = await fetchFirstAvailableFont(BOLD_FONT_URLS);
    }

    if (cachedRegularBytes && cachedBoldBytes) {
      const regular = await pdfDoc.embedFont(cachedRegularBytes, { subset: true });
      const bold = await pdfDoc.embedFont(cachedBoldBytes, { subset: true });
      return { regular, bold, isUnicode: true };
    }
  } catch (err) {
    console.warn('Không thể nhúng font TTF Unicode, chuyển sang StandardFonts:', err);
  }

  const regular = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const bold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  return { regular, bold, isUnicode: false };
}

/**
 * Chuẩn hóa chuỗi khi vẽ bằng font Standard (trường hợp hy hữu không tải được font Unicode).
 */
export function safePdfText(text: string, isUnicode: boolean): string {
  if (isUnicode) return text;
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}
