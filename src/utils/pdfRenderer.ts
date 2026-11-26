import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import { HeadingItem } from '../types/toc';
import { embedVietnameseSerifFonts, safePdfText } from './fontLoader';
import { formatDisplayTitle } from './headingParser';

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN_LEFT = 85.04; // 3.0 cm
const MARGIN_RIGHT = 56.69; // 2.0 cm
const MARGIN_TOP = 56.69; // 2.0 cm
const MARGIN_BOTTOM = 56.69; // 2.0 cm
const USABLE_WIDTH = A4_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

export interface BodyParagraphRenderItem {
  paragraphIndex: number;
  text: string;
  isBold: boolean;
  isCentered: boolean;
  fontSize: number;
  pageBreakBefore?: boolean;
}

function wrapTextLines(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  if (!text || !text.trim()) return [];

  // Tách từ theo khoảng trắng thông thường, hoặc nếu chuỗi dính underscore '_' thì tách theo underscore
  const normalized = text.includes(' ') ? text : text.replace(/_/g, ' ');
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let currentLine = '';

  for (const rawWord of words) {
    // Nếu một từ đơn lẻ vượt quá chiều rộng cho phép (ví dụ chuỗi ký tự dính liền dài không dấu cách)
    // -> Bẻ nhỏ từ này theo từng ký tự an toàn (Character wrap fallback)
    const wordWidth = font.widthOfTextAtSize(rawWord, fontSize);
    if (wordWidth > maxWidth) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = '';
      }
      let chunk = '';
      for (const char of rawWord) {
        if (font.widthOfTextAtSize(chunk + char, fontSize) <= maxWidth) {
          chunk += char;
        } else {
          if (chunk) lines.push(chunk);
          chunk = char;
        }
      }
      if (chunk) {
        currentLine = chunk;
      }
      continue;
    }

    const candidate = currentLine ? `${currentLine} ${rawWord}` : rawWord;
    const width = font.widthOfTextAtSize(candidate, fontSize);
    if (width <= maxWidth) {
      currentLine = candidate;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = rawWord;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

/**
 * Vẽ các trang Mục lục vào một PDFDocument.
 * Tự động ngắt dòng (wrap text) nếu tên đề mục quá dài, vẽ chấm bi Tab Leader (.........)
 * và căn phải số trang ở dòng cuối cùng của đề mục.
 */
function drawTocPagesIntoDocument(
  pdfDoc: PDFDocument,
  baseName: string,
  headings: HeadingItem[],
  regularFont: PDFFont,
  boldFont: PDFFont,
  isUnicode: boolean
): PDFPage[] {
  const createdPages: PDFPage[] = [];
  let page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  createdPages.push(page);

  let yCursor = A4_HEIGHT - MARGIN_TOP - 14;

  // 1. Tiêu đề tên tài liệu (In hoa, in đậm, căn giữa, 14pt)
  // Quy tắc hiển thị trong trang: Mã gốc + duy nhất 1 dấu '_' + Tên văn bản có khoảng trắng thông thường
  // VD: "158.SIGNED_NGHỊ ĐỊNH VỀ CHỨNG KHOÁN PHÁI SINH VÀ THỊ TRƯỜNG CHỨNG KHOÁN PHÁI SINH"
  const displayTitle = formatDisplayTitle(baseName);
  const docTitle = safePdfText(displayTitle, isUnicode);
  const titleFontSize = 14;
  const titleLines = wrapTextLines(docTitle, boldFont, titleFontSize, USABLE_WIDTH);

  for (const line of titleLines) {
    const w = boldFont.widthOfTextAtSize(line, titleFontSize);
    const x = MARGIN_LEFT + Math.max(0, (USABLE_WIDTH - w) / 2);
    page.drawText(line, {
      x,
      y: yCursor,
      size: titleFontSize,
      font: boldFont,
      color: rgb(0, 0, 0),
    });
    yCursor -= titleFontSize * 1.45;
  }

  yCursor -= 4;

  // 2. Dòng chữ "MỤC LỤC" (In hoa, in đậm, căn giữa, 14pt)
  const tocHeader = safePdfText('MỤC LỤC', isUnicode);
  const tocHeaderW = boldFont.widthOfTextAtSize(tocHeader, titleFontSize);
  page.drawText(tocHeader, {
    x: MARGIN_LEFT + Math.max(0, (USABLE_WIDTH - tocHeaderW) / 2),
    y: yCursor,
    size: titleFontSize,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  yCursor -= titleFontSize * 2.0;

  if (headings.length === 0) {
    const emptyMsg = safePdfText('(Không tìm thấy đề mục tự động trong tài liệu)', isUnicode);
    const emptyW = regularFont.widthOfTextAtSize(emptyMsg, 13);
    page.drawText(emptyMsg, {
      x: MARGIN_LEFT + Math.max(0, (USABLE_WIDTH - emptyW) / 2),
      y: yCursor,
      size: 13,
      font: regularFont,
      color: rgb(0.25, 0.25, 0.25),
    });
    return createdPages;
  }

  // 3. Vẽ từng dòng đề mục + Tab Leader chấm bi + Số trang căn phải
  for (const item of headings) {
    const isL1 = item.level === 1;
    const font = isL1 ? boldFont : regularFont;
    const fontSize = isL1 ? 13.5 : 13.0;
    const lineHeight = fontSize * 1.48;
    const leftIndent = isL1 ? 0 : 17.0; // 0.6cm cho Cấp 2
    const startX = MARGIN_LEFT + leftIndent;
    const maxTitleWidth = USABLE_WIDTH - leftIndent - 45;

    const safeTitle = safePdfText(item.title, isUnicode);
    const wrappedLines = wrapTextLines(safeTitle, font, fontSize, maxTitleWidth);

    for (let i = 0; i < wrappedLines.length; i++) {
      if (yCursor - lineHeight < MARGIN_BOTTOM + 20) {
        page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
        createdPages.push(page);
        yCursor = A4_HEIGHT - MARGIN_TOP - 14;
      }

      const lineStr = wrappedLines[i];
      page.drawText(lineStr, {
        x: startX,
        y: yCursor,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
      });

      // Tại dòng cuối của đề mục: vẽ chấm bi (Tab Leader) và số trang căn phải
      if (i === wrappedLines.length - 1) {
        const pageStr = String(item.pageNumber);
        const pageNumWidth = font.widthOfTextAtSize(pageStr, fontSize);
        const rightPageX = A4_WIDTH - MARGIN_RIGHT - pageNumWidth;

        const textEndX = startX + font.widthOfTextAtSize(lineStr, fontSize) + 6;
        const dotEndX = rightPageX - 6;

        if (dotEndX > textEndX) {
          const dotUnit = ' .';
          const dotUnitW = regularFont.widthOfTextAtSize(dotUnit, fontSize);
          const count = Math.max(0, Math.floor((dotEndX - textEndX) / Math.max(dotUnitW, 1)));
          const dotsStr = dotUnit.repeat(count);

          page.drawText(dotsStr, {
            x: textEndX,
            y: yCursor,
            size: fontSize,
            font: regularFont,
            color: rgb(0, 0, 0),
          });
        }

        page.drawText(pageStr, {
          x: rightPageX,
          y: yCursor,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
      }

      yCursor -= lineHeight;
    }

    yCursor -= isL1 ? 3 : 1.5;
  }

  return createdPages;
}

/**
 * Tạo tệp PDF Mục lục rời `[Mục Lục] <Base_Name>.pdf` cho Luồng B.
 * Không đánh số trang trên tệp mục lục rời này.
 */
export async function renderStandaloneTocPdf(
  baseName: string,
  headings: HeadingItem[]
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const { regular, bold, isUnicode } = await embedVietnameseSerifFonts(pdfDoc);

  drawTocPagesIntoDocument(pdfDoc, baseName, headings, regular, bold, isUnicode);

  return pdfDoc.save();
}

/**
 * Kết xuất tệp `<Base_Name> (in ấn).pdf` cho Luồng A (Word) với số trang trong Mục lục
 * khớp chính xác 100% vị trí thực tế sau khi chèn trang Mục lục ở đầu,
 * và đánh số trang liên tục từ 1 ở Chính giữa chân trang (Footer - Center).
 */
export async function renderWordPrintPdfAndSyncToc(
  baseName: string,
  headings: HeadingItem[],
  paragraphs: BodyParagraphRenderItem[]
): Promise<{ pdfBytes: Uint8Array; syncedHeadings: HeadingItem[]; totalPages: number }> {
  // Bước 1: Ước tính số trang mà bản thân Mục lục chiếm dụng (thường là 1 trang)
  const tempTocDoc = await PDFDocument.create();
  const tempFonts = await embedVietnameseSerifFonts(tempTocDoc);
  const tocPages = drawTocPagesIntoDocument(
    tempTocDoc,
    baseName,
    headings,
    tempFonts.regular,
    tempFonts.bold,
    tempFonts.isUnicode
  );
  const tocPageCount = Math.max(1, tocPages.length);

  // Bước 2: Dựng các trang nội dung vào một PDF tạm để biết chính xác từng đoạn Heading nằm ở trang nào
  const bodyDoc = await PDFDocument.create();
  const bodyFonts = await embedVietnameseSerifFonts(bodyDoc);

  let currentPage = bodyDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  let currentBodyPageNumber = tocPageCount + 1; // Nội dung gốc bắt đầu ngay sau các trang Mục lục
  let yCursor = A4_HEIGHT - MARGIN_TOP - 14;

  const paragraphToPageMap = new Map<number, number>();

  for (const para of paragraphs) {
    if (para.pageBreakBefore && yCursor < A4_HEIGHT - MARGIN_TOP - 20) {
      currentPage = bodyDoc.addPage([A4_WIDTH, A4_HEIGHT]);
      currentBodyPageNumber++;
      yCursor = A4_HEIGHT - MARGIN_TOP - 14;
    }

    const clean = para.text.trim();
    if (!clean) {
      yCursor -= 10;
      paragraphToPageMap.set(para.paragraphIndex, currentBodyPageNumber);
      continue;
    }

    const font = para.isBold ? bodyFonts.bold : bodyFonts.regular;
    const fontSize = Math.min(16, Math.max(11, para.fontSize || 13));
    const lineHeight = fontSize * 1.45;
    const safeStr = safePdfText(clean, bodyFonts.isUnicode);
    const lines = wrapTextLines(safeStr, font, fontSize, USABLE_WIDTH);

    for (let i = 0; i < lines.length; i++) {
      if (yCursor - lineHeight < MARGIN_BOTTOM + 22) {
        currentPage = bodyDoc.addPage([A4_WIDTH, A4_HEIGHT]);
        currentBodyPageNumber++;
        yCursor = A4_HEIGHT - MARGIN_TOP - 14;
      }

      if (i === 0) {
        paragraphToPageMap.set(para.paragraphIndex, currentBodyPageNumber);
      }

      const lineStr = lines[i];
      let xPos = MARGIN_LEFT;
      if (para.isCentered) {
        const w = font.widthOfTextAtSize(lineStr, fontSize);
        xPos = MARGIN_LEFT + Math.max(0, (USABLE_WIDTH - w) / 2);
      }

      currentPage.drawText(lineStr, {
        x: xPos,
        y: yCursor,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
      });

      yCursor -= lineHeight;
    }

    yCursor -= 5;
  }

  // Bước 3: Cập nhật lại số trang chính xác cho từng đề mục trong Mục lục
  const syncedHeadings: HeadingItem[] = headings.map((h) => ({
    ...h,
    pageNumber:
      h.paragraphIndex !== undefined && paragraphToPageMap.has(h.paragraphIndex)
        ? paragraphToPageMap.get(h.paragraphIndex)!
        : h.pageNumber,
  }));

  // Bước 4: Tạo PDF hoàn chỉnh gồm [Trang Mục Lục đã đồng bộ số trang] + [Các trang nội dung]
  const finalPdf = await PDFDocument.create();
  const finalFonts = await embedVietnameseSerifFonts(finalPdf);

  drawTocPagesIntoDocument(
    finalPdf,
    baseName,
    syncedHeadings,
    finalFonts.regular,
    finalFonts.bold,
    finalFonts.isUnicode
  );

  const copiedBodyPages = await finalPdf.copyPages(bodyDoc, bodyDoc.getPageIndices());
  copiedBodyPages.forEach((p) => finalPdf.addPage(p));

  // Bước 5: Đánh số trang liên tục từ 1 ngay tại Trang 1 (Footer - Center) cho toàn bộ tài liệu
  const allPages = finalPdf.getPages();
  allPages.forEach((p, idx) => {
    const pageNumStr = String(idx + 1);
    const { width } = p.getSize();
    const numW = finalFonts.regular.widthOfTextAtSize(pageNumStr, 11);
    p.drawText(pageNumStr, {
      x: (width - numW) / 2,
      y: 28, // Chính giữa chân trang (~1cm từ mép dưới)
      size: 11,
      font: finalFonts.regular,
      color: rgb(0, 0, 0),
    });
  });

  const pdfBytes = await finalPdf.save();
  return {
    pdfBytes,
    syncedHeadings,
    totalPages: allPages.length,
  };
}
