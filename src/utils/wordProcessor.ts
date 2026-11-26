import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  TextRun,
  convertMillimetersToTwip,
} from 'docx';
import JSZip from 'jszip';
import { CandidateBlock, HeadingItem, OutputFileItem } from '../types/toc';
import { buildStandaloneTocDocx, injectTocAndFooterIntoDocx } from './docxBuilder';
import {
  cleanHeadingText,
  ensureDocumentTypePrefix,
  extractOfficialDocumentTitle,
  formatSmartBaseName,
  getBaseName,
  isValidDocumentTitle,
  parseHeadingsFromBlocks,
} from './headingParser';
import { extractTocFromWordWithGemini, hasGeminiApiKey } from './llmTocService';
import { BodyParagraphRenderItem, renderWordPrintPdfAndSyncToc } from './pdfRenderer';

export interface WordProcessResult {
  baseName: string;
  headings: HeadingItem[];
  totalPages: number;
  outputs: OutputFileItem[];
  paragraphs: BodyParagraphRenderItem[];
}

function getMedian(values: number[], fallback = 13.0): number {
  if (!values.length) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCharCode(parseInt(dec, 10));
      } catch {
        return '';
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return '';
      }
    });
}

interface ParsedDocParagraphItem {
  text: string;
  isBold: boolean;
  isCentered: boolean;
  isRight: boolean;
  isHeadingCandidate: boolean;
}

function parseWordHtmlToParagraphItems(html: string): ParsedDocParagraphItem[] {
  const clean = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<xml[\s\S]*?<\/xml>/gi, '')
    .replace(/<!\[if[\s\S]*?<!\[endif\]>/gi, '');

  const blockRegex = /<(p|h[1-6]|li)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  const paragraphs: ParsedDocParagraphItem[] = [];
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(clean)) !== null) {
    const tagName = match[1].toLowerCase();
    const attrs = match[2] || '';
    const innerHtml = match[3] || '';

    const isCentered = /align=['"]?center['"]?/i.test(attrs) || /text-align:\s*center/i.test(attrs);
    const isRight = /align=['"]?right['"]?/i.test(attrs) || /text-align:\s*right/i.test(attrs);

    const isTagBold =
      tagName.startsWith('h') ||
      /<b\b/i.test(innerHtml) ||
      /<strong\b/i.test(innerHtml) ||
      /font-weight:\s*bold/i.test(attrs) ||
      /font-weight:\s*bold/i.test(innerHtml);

    const subLines = innerHtml.split(/<br\s*\/?>/gi);
    for (const sub of subLines) {
      let rawText = sub.replace(/<[^>]+>/g, '');
      rawText = decodeHtmlEntities(rawText)
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

      // Bỏ qua các dòng gạch phân cách như "-------" hoặc "---------------"
      if (/^[-–—_\s]+$/.test(rawText)) {
        continue;
      }

      if (rawText.length > 0) {
        const isHeadingCandidate =
          /^(LỜI\s+NÓI\s+ĐẦU|QUYẾT\s+ĐỊNH|PHẦN|CHƯƠNG|MỤC|ĐIỀU|INTRODUCTION|PREFACE|PART|CHAPTER|SECTION|ARTICLE|CONCLUSION)\b/iu.test(
            rawText
          ) ||
          (rawText === rawText.toUpperCase() && /\p{L}/u.test(rawText) && rawText.length < 120);

        paragraphs.push({
          text: rawText,
          isBold: isTagBold || isHeadingCandidate,
          isCentered,
          isRight,
          isHeadingCandidate,
        });
      }
    }
  }

  return paragraphs;
}

/**
 * Trích xuất văn bản từ tệp .doc cũ (Word 97-2003 / RTF / HTML-doc) và chuyển đổi
 * thành cấu trúc .docx chuẩn để xử lý đồng nhất.
 */
async function convertLegacyDocBufferToDocxZip(buffer: ArrayBuffer): Promise<JSZip> {
  const bytes = new Uint8Array(buffer);
  const utf8Text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const utf16Text = new TextDecoder('utf-16le', { fatal: false }).decode(bytes);

  // Chọn bảng mã có nhiều ký tự tiếng Việt / chữ cái hợp lệ hơn
  const countReadable = (s: string) => (s.match(/[\p{L}\d\s.,:;!?()-]/gu) || []).length;
  const rawSource = countReadable(utf16Text) > countReadable(utf8Text) ? utf16Text : utf8Text;

  const isHtml =
    /<html\b/i.test(rawSource) ||
    /<w:WordDocument\b/i.test(rawSource) ||
    /<!DOCTYPE\s+html/i.test(rawSource) ||
    /<body\b/i.test(rawSource);

  let parsedItems: ParsedDocParagraphItem[] = [];
  if (isHtml) {
    parsedItems = parseWordHtmlToParagraphItems(rawSource);
  }

  // Nếu không phải HTML hoặc parse HTML không ra dòng nào -> Fallback sang phân tích nhị phân thuần
  if (parsedItems.length === 0) {
    const lines = rawSource
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map((l) => l.replace(/[^\p{L}\p{N}\p{P}\p{Zs}]/gu, '').trim())
      .filter((l) => l.length >= 2 && /[\p{L}\d]/u.test(l));

    parsedItems = lines.map((line) => {
      const isHeadingCandidate =
        /^(LỜI\s+NÓI\s+ĐẦU|QUYẾT\s+ĐỊNH|PHẦN|CHƯƠNG|MỤC|ĐIỀU|INTRODUCTION|PREFACE|PART|CHAPTER|SECTION|ARTICLE|CONCLUSION)\b/iu.test(
          line
        ) ||
        (line === line.toUpperCase() && /\p{L}/u.test(line) && line.length < 120);

      return {
        text: line,
        isBold: isHeadingCandidate,
        isCentered: false,
        isRight: false,
        isHeadingCandidate,
      };
    });
  }

  const children = parsedItems.map((item) => {
    return new Paragraph({
      alignment: item.isCentered
        ? AlignmentType.CENTER
        : item.isRight
        ? AlignmentType.RIGHT
        : AlignmentType.LEFT,
      children: [
        new TextRun({
          text: item.text,
          font: 'Times New Roman',
          size: item.isHeadingCandidate ? 27 : 26,
          bold: item.isBold,
        }),
      ],
    });
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertMillimetersToTwip(210),
              height: convertMillimetersToTwip(297),
            },
            margin: {
              top: convertMillimetersToTwip(20),
              bottom: convertMillimetersToTwip(20),
              left: convertMillimetersToTwip(30),
              right: convertMillimetersToTwip(20),
            },
          },
        },
        children,
      },
    ],
  });

  const docxBlob = await Packer.toBlob(doc);
  return JSZip.loadAsync(await docxBlob.arrayBuffer());
}

/**
 * Xử lý trọn vẹn LUỒNG A (.doc / .docx):
 * 1. Nếu là .doc -> Tự động convert sang cấu trúc .docx.
 * 2. Nhận diện đề mục thông minh (Lớp 1: Style Heading 1/2, Lớp 2: Bold/Size + Regex VI/EN) & Ghép dòng tiêu đề.
 * 3. Gán Style Heading 1/2, chèn trang Mục lục ở Trang 1, đánh số trang giữa chân trang từ 1.
 * 4. Đồng bộ số trang thực tế và xuất 2 tệp bắt buộc:
 *    - <Base_Name>_muc_luc.docx
 *    - <Base_Name> (in ấn).pdf
 */
export async function processWordDocument(
  file: File,
  onProgress?: (stepLabel: string, progress: number) => void
): Promise<WordProcessResult> {
  const baseName = getBaseName(file.name);
  onProgress?.('Đang đọc cấu trúc tài liệu Word...', 15);

  const arrayBuffer = await file.arrayBuffer();
  let zip: JSZip;

  try {
    zip = await JSZip.loadAsync(arrayBuffer);
    if (!zip.file('word/document.xml')) {
      throw new Error('Not a standard OOXML docx');
    }
  } catch {
    onProgress?.('Đang chuyển đổi định dạng .doc cũ sang .docx...', 25);
    zip = await convertLegacyDocBufferToDocxZip(arrayBuffer);
  }

  onProgress?.('Đang phân tích đề mục & ghép dòng tiêu đề (VI/EN)...', 40);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const docXmlStr = await zip.file('word/document.xml')!.async('string');
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(docXmlStr, 'application/xml');
  const wNs = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

  const body = xmlDoc.getElementsByTagNameNS(wNs, 'body')[0];
  if (!body) {
    throw new Error('Không tìm thấy nội dung văn bản trong tệp Word.');
  }

  const directParagraphs: Element[] = [];
  for (let i = 0; i < body.childNodes.length; i++) {
    const node = body.childNodes[i];
    if (node.nodeType === 1 && (node as Element).localName === 'p') {
      directParagraphs.push(node as Element);
    }
  }

  const candidateBlocks: CandidateBlock[] = [];
  const bodyParagraphs: BodyParagraphRenderItem[] = [];
  const fontSizes: number[] = [];

  let estimatedPage = 2; // Trang 1 dành cho Mục lục, nội dung bắt đầu từ Trang 2
  let charsOnCurrentPage = 0;

  directParagraphs.forEach((pEl, idx) => {
    const brEls = Array.from(pEl.getElementsByTagNameNS(wNs, 'br'));
    const hasPageBreak = brEls.some((br) => br.getAttribute('w:type') === 'page');
    if (hasPageBreak && charsOnCurrentPage > 0) {
      estimatedPage++;
      charsOnCurrentPage = 0;
    }

    const tEls = Array.from(pEl.getElementsByTagNameNS(wNs, 't'));
    const rawText = tEls.map((t) => t.textContent || '').join('');
    const cleaned = cleanHeadingText(rawText);

    // Kiểm tra style Heading 1/2/3 có sẵn
    let styleLevel: 1 | 2 | null = null;
    const pStyleEl = pEl.getElementsByTagNameNS(wNs, 'pStyle')[0];
    if (pStyleEl) {
      const styleVal = (pStyleEl.getAttribute('w:val') || '').toLowerCase();
      if (styleVal === 'heading1' || styleVal === 'heading 1' || styleVal === 'tiu1') {
        styleLevel = 1;
      } else if (
        styleVal === 'heading2' ||
        styleVal === 'heading 2' ||
        styleVal === 'heading3' ||
        styleVal === 'heading 3'
      ) {
        styleLevel = 2;
      }
    }

    // Kiểm tra căn giữa
    const jcEl = pEl.getElementsByTagNameNS(wNs, 'jc')[0];
    const isCentered = jcEl?.getAttribute('w:val') === 'center';

    // Kiểm tra thuộc tính In đậm (w:b) và Cỡ chữ (w:sz) trên các Run
    const runEls = Array.from(pEl.getElementsByTagNameNS(wNs, 'r'));
    let totalChars = 0;
    let boldChars = 0;
    const runSizes: number[] = [];

    for (const rEl of runEls) {
      const rText = Array.from(rEl.getElementsByTagNameNS(wNs, 't'))
        .map((t) => t.textContent || '')
        .join('')
        .trim();
      if (!rText) continue;

      totalChars += rText.length;
      const bEl = rEl.getElementsByTagNameNS(wNs, 'b')[0];
      const bVal = bEl?.getAttribute('w:val');
      const isRunBold = bEl !== undefined && bVal !== '0' && bVal !== 'false';
      if (isRunBold) {
        boldChars += rText.length;
      }

      const szEl = rEl.getElementsByTagNameNS(wNs, 'sz')[0];
      const szVal = szEl?.getAttribute('w:val');
      if (szVal) {
        const pt = parseInt(szVal, 10) / 2;
        if (!Number.isNaN(pt) && pt > 5) {
          runSizes.push(pt);
        }
      }
    }

    const isBold =
      styleLevel !== null || (totalChars > 0 && boldChars / totalChars >= 0.65);
    const fontSize = runSizes.length ? Math.max(...runSizes) : 13.0;

    if (cleaned) {
      fontSizes.push(fontSize);
      candidateBlocks.push({
        text: cleaned,
        isBold,
        fontSize,
        pageNumber: estimatedPage,
        paragraphIndex: idx,
        styleLevel,
      });
    }

    bodyParagraphs.push({
      paragraphIndex: idx,
      text: cleaned,
      isBold,
      isCentered,
      fontSize,
      pageBreakBefore: hasPageBreak,
    });

    charsOnCurrentPage += cleaned.length + 45;
    if (charsOnCurrentPage >= 2300) {
      estimatedPage++;
      charsOnCurrentPage = 0;
    }
  });

  // Quét tìm Tên văn bản chính thức (LUẬT, NGHỊ ĐỊNH...) từ các khối đoạn văn đầu
  const rawLocalTitle = extractOfficialDocumentTitle(candidateBlocks);
  const localOfficialTitle = ensureDocumentTypePrefix(rawLocalTitle || '', candidateBlocks);

  let smartBaseName = baseName;
  let initialHeadings: HeadingItem[] = [];
  let usedLlm = false;

  // THỬ NGHIỆM 1: Nhận diện Mục Lục thông minh bằng Gemini LLM API nếu đã cấu hình Key
  if (hasGeminiApiKey()) {
    onProgress?.('Đang phân tích cấu trúc đề mục tự động...', 40);
    try {
      const candidateParas = candidateBlocks.map((b) => ({
        index: b.paragraphIndex,
        text: b.text,
        isBold: b.isBold,
        fontSize: b.fontSize,
      }));
      const llmResult = await extractTocFromWordWithGemini(candidateParas, file.name);
      if (llmResult && llmResult.toc_items && llmResult.toc_items.length > 0) {
        usedLlm = true;
        // Bắt buộc document_title phải là Tên văn bản hợp lệ, tuyệt đối không lấy Điều/Chương
        const rawTitle = isValidDocumentTitle(llmResult.document_title)
          ? llmResult.document_title
          : localOfficialTitle;
        const chosenTitle = ensureDocumentTypePrefix(rawTitle, candidateBlocks);
        smartBaseName = formatSmartBaseName(baseName, chosenTitle);
        initialHeadings = llmResult.toc_items.map((it, idx) => {
          const matchBlock = candidateBlocks.find((b) => b.paragraphIndex === it.paragraph_index);
          return {
            id: `llm-doc-h-${idx + 1}-${it.paragraph_index}`,
            level: it.level,
            title: it.title,
            pageNumber: matchBlock?.pageNumber ?? 2,
            paragraphIndex: it.paragraph_index,
          };
        });
      }
    } catch (e) {
      console.warn('Fallback về bộ lọc Regex nội bộ cho Word do lỗi LLM:', e);
    }
  }

  // THỬ NGHIỆM 2: Nếu không dùng LLM hoặc LLM không trả về kết quả -> Dùng bộ lọc Regex Heuristic cục bộ
  if (!usedLlm) {
    const medianFontSize = getMedian(fontSizes, 13.0);
    initialHeadings = parseHeadingsFromBlocks(candidateBlocks, medianFontSize);
    // Dùng Tên văn bản chính thức đã trích xuất từ đầu tài liệu, TUYỆT ĐỐI không lấy initialHeadings[0]
    smartBaseName = formatSmartBaseName(baseName, localOfficialTitle);
  }

  // Áp dụng ghép dòng tiêu đề vào danh sách đoạn văn dùng để kết xuất PDF in ấn
  const mergedRemoveSet = new Set<number>();
  const mergedTitleByIndex = new Map<number, { title: string; level: 1 | 2 }>();
  for (const h of initialHeadings) {
    if (h.paragraphIndex !== undefined) {
      mergedTitleByIndex.set(h.paragraphIndex, { title: h.title, level: h.level });
    }
    if (h.mergedNextIndex !== undefined && h.mergedNextIndex >= 0) {
      mergedRemoveSet.add(h.mergedNextIndex);
    }
  }

  const finalBodyParagraphs: BodyParagraphRenderItem[] = bodyParagraphs
    .filter((p) => !mergedRemoveSet.has(p.paragraphIndex))
    .map((p) => {
      const mergedInfo = mergedTitleByIndex.get(p.paragraphIndex);
      if (mergedInfo) {
        return {
          ...p,
          text: mergedInfo.title,
          isBold: true,
          fontSize: mergedInfo.level === 1 ? 13.5 : 13.0,
        };
      }
      return p;
    });

  onProgress?.('Đang dàn trang, cập nhật số trang Mục lục & xuất PDF in ấn...', 70);

  const { pdfBytes, syncedHeadings, totalPages } = await renderWordPrintPdfAndSyncToc(
    smartBaseName,
    initialHeadings,
    finalBodyParagraphs
  );

  onProgress?.('Đang đóng gói tệp Word (bảo toàn định dạng gốc) & Mục lục rời...', 90);

  const modifiedDocxBlob = await injectTocAndFooterIntoDocx(zip, smartBaseName, syncedHeadings);
  const standaloneDocxBlob = await buildStandaloneTocDocx(smartBaseName, syncedHeadings);
  const printPdfBlob = new Blob([pdfBytes as unknown as BlobPart], {
    type: 'application/pdf',
  });

  const outputs: OutputFileItem[] = [
    {
      name: `${smartBaseName}.docx`,
      blob: modifiedDocxBlob,
      url: URL.createObjectURL(modifiedDocxBlob),
      kind: 'docx',
      description: 'Tệp Word gốc giữ nguyên 100% định dạng, đã chèn Mục lục ở đầu',
    },
    {
      name: `[Mục Lục] ${smartBaseName}.docx`,
      blob: standaloneDocxBlob,
      url: URL.createObjectURL(standaloneDocxBlob),
      kind: 'docx',
      description: 'Tệp Word Mục lục rời độc lập',
    },
    {
      name: `${smartBaseName} (in ấn).pdf`,
      blob: printPdfBlob,
      url: URL.createObjectURL(printPdfBlob),
      kind: 'pdf',
      description: 'Tệp PDF xuất bản chuẩn in ấn (đã đồng bộ số trang Mục lục)',
    },
  ];

  onProgress?.('Hoàn tất!', 100);

  return {
    baseName: smartBaseName,
    headings: syncedHeadings,
    totalPages,
    outputs,
    paragraphs: finalBodyParagraphs,
  };
}

/**
 * Tái tạo nhanh 3 tệp đầu ra của Luồng A khi người dùng chỉnh sửa trực tiếp
 * danh sách đề mục trên giao diện Web/Mobile.
 */
export async function rebuildWordOutputs(
  originalFile: File,
  baseName: string,
  customHeadings: HeadingItem[],
  paragraphs: BodyParagraphRenderItem[]
): Promise<OutputFileItem[]> {
  const arrayBuffer = await originalFile.arrayBuffer();
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(arrayBuffer);
    if (!zip.file('word/document.xml')) throw new Error('legacy');
  } catch {
    zip = await convertLegacyDocBufferToDocxZip(arrayBuffer);
  }

  const { pdfBytes } = await renderWordPrintPdfAndSyncToc(
    baseName,
    customHeadings,
    paragraphs
  );
  const modifiedDocxBlob = await injectTocAndFooterIntoDocx(zip, baseName, customHeadings);
  const standaloneDocxBlob = await buildStandaloneTocDocx(baseName, customHeadings);
  const printPdfBlob = new Blob([pdfBytes as unknown as BlobPart], {
    type: 'application/pdf',
  });

  return [
    {
      name: `${baseName}.docx`,
      blob: modifiedDocxBlob,
      url: URL.createObjectURL(modifiedDocxBlob),
      kind: 'docx',
      description: 'Tệp Word gốc giữ nguyên 100% định dạng, đã chèn Mục lục ở đầu',
    },
    {
      name: `[Mục Lục] ${baseName}.docx`,
      blob: standaloneDocxBlob,
      url: URL.createObjectURL(standaloneDocxBlob),
      kind: 'docx',
      description: 'Tệp Word Mục lục rời độc lập',
    },
    {
      name: `${baseName} (in ấn).pdf`,
      blob: printPdfBlob,
      url: URL.createObjectURL(printPdfBlob),
      kind: 'pdf',
      description: 'Tệp PDF xuất bản chuẩn in ấn (đã đồng bộ số trang Mục lục)',
    },
  ];
}
