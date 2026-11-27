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
import { isOle2BinaryDoc, parseBinaryDocToParagraphItems } from './binaryDocParser';
import { buildStandaloneTocDocx, injectTocAndFooterIntoDocx } from './docxBuilder';
import {
  cleanHeadingText,
  ensureDocumentTypePrefix,
  extractOfficialDocumentTitle,
  formatDisplayTitle,
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
          /^(LỜI\s+NÓI\s+ĐẦU|QUYẾT\s+ĐỊNH|PHẦN|CHƯƠNG|PHỤ\s+LỤC|MỤC|ĐIỀU|INTRODUCTION|PREFACE|PART|CHAPTER|APPENDIX|SECTION|ARTICLE|CONCLUSION)\b/iu.test(
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

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function extractWordHtmlSource(buffer: ArrayBuffer): string | null {
  if (isOle2BinaryDoc(buffer)) return null;
  const bytes = new Uint8Array(buffer);
  const utf8Text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const utf16Text = new TextDecoder('utf-16le', { fatal: false }).decode(bytes);

  const countReadable = (s: string) => (s.match(/[\p{L}\d\s.,:;!?()-]/gu) || []).length;
  const rawSource = countReadable(utf16Text) > countReadable(utf8Text) ? utf16Text : utf8Text;

  const isHtml =
    /<html\b/i.test(rawSource) ||
    /<w:WordDocument\b/i.test(rawSource) ||
    /<!DOCTYPE\s+html/i.test(rawSource) ||
    /<body\b/i.test(rawSource);

  return isHtml ? rawSource : null;
}

/**
 * Chèn trực tiếp khối Trang Mục lục + Page Break vào ngay đầu <body> của file Word HTML gốc,
 * giữ nguyên 100% mã HTML, CSS, bảng biểu, chữ nghiêng và chữ ký ban đầu.
 */
export function injectTocIntoWordHtmlDoc(
  rawHtml: string,
  baseName: string,
  headings: HeadingItem[]
): Blob {
  const displayTitle = escapeHtml(formatDisplayTitle(baseName));

  const rowsHtml =
    headings.length === 0
      ? `<tr><td colspan="2" style="text-align:center;font-family:'Times New Roman',serif;font-size:13pt;font-style:italic;padding:6pt 0;">(Không tìm thấy đề mục tự động trong tài liệu)</td></tr>`
      : headings
          .map((h) => {
            const isL1 = h.level === 1;
            const fontSize = isL1 ? '13.5pt' : '13pt';
            const fontWeight = isL1 ? 'bold' : 'normal';
            const padLeft = isL1 ? '0pt' : '18pt';
            const padTop = isL1 ? '5pt' : '3pt';
            return `<tr>
  <td style="font-family:'Times New Roman',serif;font-size:${fontSize};font-weight:${fontWeight};padding:${padTop} 8pt 2pt ${padLeft};border-bottom:1pt dotted #666666;vertical-align:bottom;">${escapeHtml(h.title)}</td>
  <td style="font-family:'Times New Roman',serif;font-size:${fontSize};font-weight:${fontWeight};padding:${padTop} 0pt 2pt 6pt;border-bottom:1pt dotted #666666;text-align:right;white-space:nowrap;vertical-align:bottom;">${h.pageNumber}</td>
</tr>`;
          })
          .join('\n');

  const tocBlock = `
<div class="autotoc-injected-section" style="font-family:'Times New Roman',serif;">
  <p align="center" style="text-align:center;margin:0 0 4pt 0;font-family:'Times New Roman',serif;font-size:14pt;font-weight:bold;">${displayTitle}</p>
  <p align="center" style="text-align:center;margin:0 0 14pt 0;font-family:'Times New Roman',serif;font-size:14pt;font-weight:bold;">MỤC LỤC</p>
  <table border="0" cellspacing="0" cellpadding="0" width="100%" style="width:100%;border-collapse:collapse;margin-bottom:12pt;">
    ${rowsHtml}
  </table>
  <br clear="all" style="page-break-before:always" />
</div>
`;

  const bodyOpenMatch = /<body\b[^>]*>/i.exec(rawHtml);
  const updatedHtml = bodyOpenMatch
    ? rawHtml.slice(0, bodyOpenMatch.index + bodyOpenMatch[0].length) +
      tocBlock +
      rawHtml.slice(bodyOpenMatch.index + bodyOpenMatch[0].length)
    : tocBlock + rawHtml;

  return new Blob([updatedHtml], { type: 'application/msword;charset=utf-8' });
}

/**
 * Trích xuất văn bản từ tệp .doc cũ (Word 97-2003 / RTF / HTML-doc) và chuyển đổi
 * thành cấu trúc .docx chuẩn để xử lý đồng nhất.
 */
async function convertLegacyDocBufferToDocxZip(buffer: ArrayBuffer): Promise<JSZip> {
  let parsedItems: ParsedDocParagraphItem[] = [];

  // 1. Ưu tiên giải mã chuẩn OLE2 Binary Word 97-2003 (FIB + Piece Table)
  if (isOle2BinaryDoc(buffer)) {
    parsedItems = parseBinaryDocToParagraphItems(buffer);
  }

  // 2. Nếu không phải OLE2 (hoặc OLE2 chưa trích được), kiểm tra định dạng Word HTML
  if (parsedItems.length === 0) {
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

    if (isHtml) {
      parsedItems = parseWordHtmlToParagraphItems(rawSource);
    }

    // 3. Fallback cuối cùng: Lọc an toàn để không bao giờ in ra trang rác nhị phân
    if (parsedItems.length === 0) {
      const lines = rawSource
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .map((l) =>
          l
            .replace(/\bHYPERLINK\s+\\l\s+"[^"]*"\s*/gi, '')
            .replace(/[^\p{L}\p{N}\p{P}\p{Zs}]/gu, '')
            .trim()
        )
        .filter((l) => {
          if (l.length < 2 || !/[\p{L}\d]/u.test(l)) return false;
          const validLatin = (l.match(/[\x20-\x7e\u00c0-\u024f\u1e00-\u1eff]/g) || []).length;
          return validLatin / l.length >= 0.75;
        });

      parsedItems = lines.map((line) => {
        const isHeadingCandidate =
          /^(LỜI\s+NÓI\s+ĐẦU|QUYẾT\s+ĐỊNH|PHẦN|CHƯƠNG|PHỤ\s+LỤC|MỤC|ĐIỀU|INTRODUCTION|PREFACE|PART|CHAPTER|APPENDIX|SECTION|ARTICLE|CONCLUSION)\b/iu.test(
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
  let originalHtmlSource: string | null = null;

  try {
    zip = await JSZip.loadAsync(arrayBuffer);
    if (!zip.file('word/document.xml')) {
      throw new Error('Not a standard OOXML docx');
    }
  } catch {
    onProgress?.('Đang chuyển đổi định dạng .doc cũ sang .docx...', 25);
    originalHtmlSource = extractWordHtmlSource(arrayBuffer);
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
    if (/^[-–—_*=\s]{3,}$/.test(cleaned)) {
      return;
    }

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
        isCentered,
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
  const medianFontSize = getMedian(fontSizes, 13.0);

  let smartBaseName = baseName;
  let initialHeadings: HeadingItem[] = [];
  let usedLlm = false;

  // THỬ NGHIỆM 1: Nhận diện Mục Lục thông minh bằng Gemini LLM API nếu đã cấu hình Key
  if (hasGeminiApiKey()) {
    onProgress?.('Đang phân tích cấu trúc đề mục tự động bằng AI...', 40);
    try {
      const candidateParas = candidateBlocks.map((b) => ({
        index: b.paragraphIndex,
        text: b.text,
        isBold: b.isBold,
        fontSize: b.fontSize,
        isCentered: b.isCentered,
        styleLevel: b.styleLevel,
      }));
      const llmResult = await extractTocFromWordWithGemini(candidateParas, file.name, {
        medianFontSize,
        onChunkProgress: (completed, total) => {
          const pct = Math.min(65, 40 + Math.round((completed / Math.max(1, total)) * 25));
          onProgress?.(
            total > 1
              ? `Đang phân tích đề mục bằng AI (khúc ${completed}/${total})...`
              : 'Đang phân tích cấu trúc đề mục bằng AI...',
            pct
          );
        },
      });

      if (llmResult && llmResult.toc_items && llmResult.toc_items.length > 0) {
        const candidateByIndex = new Map(candidateBlocks.map((b) => [b.paragraphIndex, b]));
        const validLlmItems = llmResult.toc_items.filter((it) =>
          candidateByIndex.has(it.paragraph_index)
        );

        if (validLlmItems.length > 0) {
          const headingIndexSet = new Set(validLlmItems.map((it) => it.paragraph_index));
          const confirmedMergedSet = new Set<number>();

          initialHeadings = validLlmItems.map((it, idx) => {
            const matchBlock = candidateByIndex.get(it.paragraph_index);
            const validMerged = Array.from(
              new Set(
                (it.merged_indices ?? []).filter(
                  (m) =>
                    Number.isInteger(m) &&
                    m > it.paragraph_index &&
                    m <= it.paragraph_index + 3 &&
                    candidateByIndex.has(m) &&
                    !headingIndexSet.has(m)
                )
              )
            ).sort((a, b) => a - b);

            for (const m of validMerged) {
              confirmedMergedSet.add(m);
            }

            return {
              id: `llm-doc-h-${idx + 1}-${it.paragraph_index}`,
              level: it.level,
              title: it.title,
              pageNumber: matchBlock?.pageNumber ?? 2,
              paragraphIndex: it.paragraph_index,
              mergedNextIndex: validMerged[0] ?? -1,
              mergedIndices: validMerged,
            };
          });

          // Partial fallback cục bộ cho các khúc bị lỗi/timeout hoặc vượt giới hạn khúc
          if (llmResult.failed_ranges && llmResult.failed_ranges.length > 0) {
            for (const range of llmResult.failed_ranges) {
              const rangeBlocks = candidateBlocks.filter(
                (b) =>
                  b.paragraphIndex >= range.startParagraphIndex &&
                  b.paragraphIndex <= range.endParagraphIndex
              );
              if (!rangeBlocks.length) continue;

              const fallbackRangeHeadings = parseHeadingsFromBlocks(rangeBlocks, medianFontSize);
              for (const fh of fallbackRangeHeadings) {
                if (
                  fh.paragraphIndex !== undefined &&
                  !headingIndexSet.has(fh.paragraphIndex) &&
                  !confirmedMergedSet.has(fh.paragraphIndex)
                ) {
                  headingIndexSet.add(fh.paragraphIndex);
                  const validNext =
                    fh.mergedNextIndex !== undefined &&
                    fh.mergedNextIndex >= 0 &&
                    !headingIndexSet.has(fh.mergedNextIndex)
                      ? fh.mergedNextIndex
                      : -1;
                  if (validNext >= 0) {
                    confirmedMergedSet.add(validNext);
                  }
                  initialHeadings.push({
                    ...fh,
                    mergedNextIndex: validNext,
                    mergedIndices: validNext >= 0 ? [validNext] : [],
                  });
                }
              }
            }

            initialHeadings.sort(
              (a, b) => (a.paragraphIndex ?? 0) - (b.paragraphIndex ?? 0)
            );
          }

          usedLlm = true;
          // Bắt buộc document_title phải là Tên văn bản hợp lệ, tuyệt đối không lấy Điều/Chương
          const rawTitle = isValidDocumentTitle(llmResult.document_title)
            ? llmResult.document_title
            : localOfficialTitle;
          const chosenTitle = ensureDocumentTypePrefix(rawTitle, candidateBlocks);
          smartBaseName = formatSmartBaseName(baseName, chosenTitle);
        }
      }
    } catch (e) {
      console.warn('Fallback về bộ lọc Regex nội bộ cho Word do lỗi LLM:', e);
    }
  }

  // THỬ NGHIỆM 2: Nếu không dùng LLM hoặc LLM không trả về kết quả -> Dùng bộ lọc Regex Heuristic cục bộ
  if (!usedLlm) {
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
  }
  for (const h of initialHeadings) {
    if (
      h.mergedNextIndex !== undefined &&
      h.mergedNextIndex >= 0 &&
      !mergedTitleByIndex.has(h.mergedNextIndex)
    ) {
      mergedRemoveSet.add(h.mergedNextIndex);
    }
    if (h.mergedIndices) {
      for (const mIdx of h.mergedIndices) {
        if (mIdx >= 0 && !mergedTitleByIndex.has(mIdx)) {
          mergedRemoveSet.add(mIdx);
        }
      }
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

  const modifiedWordBlob = originalHtmlSource
    ? injectTocIntoWordHtmlDoc(originalHtmlSource, smartBaseName, syncedHeadings)
    : await injectTocAndFooterIntoDocx(zip, smartBaseName, syncedHeadings);
  const primaryWordExt = originalHtmlSource ? 'doc' : 'docx';
  const standaloneDocxBlob = await buildStandaloneTocDocx(smartBaseName, syncedHeadings);
  const printPdfBlob = new Blob([pdfBytes as unknown as BlobPart], {
    type: 'application/pdf',
  });

  const outputs: OutputFileItem[] = [
    {
      name: `${smartBaseName}.${primaryWordExt}`,
      blob: modifiedWordBlob,
      url: URL.createObjectURL(modifiedWordBlob),
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
  let originalHtmlSource: string | null = null;
  try {
    zip = await JSZip.loadAsync(arrayBuffer);
    if (!zip.file('word/document.xml')) throw new Error('legacy');
  } catch {
    originalHtmlSource = extractWordHtmlSource(arrayBuffer);
    zip = await convertLegacyDocBufferToDocxZip(arrayBuffer);
  }

  const { pdfBytes } = await renderWordPrintPdfAndSyncToc(
    baseName,
    customHeadings,
    paragraphs
  );
  const modifiedWordBlob = originalHtmlSource
    ? injectTocIntoWordHtmlDoc(originalHtmlSource, baseName, customHeadings)
    : await injectTocAndFooterIntoDocx(zip, baseName, customHeadings);
  const primaryWordExt = originalHtmlSource ? 'doc' : 'docx';
  const standaloneDocxBlob = await buildStandaloneTocDocx(baseName, customHeadings);
  const printPdfBlob = new Blob([pdfBytes as unknown as BlobPart], {
    type: 'application/pdf',
  });

  return [
    {
      name: `${baseName}.${primaryWordExt}`,
      blob: modifiedWordBlob,
      url: URL.createObjectURL(modifiedWordBlob),
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
