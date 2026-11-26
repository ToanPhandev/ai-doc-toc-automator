import { CandidateBlock, HeadingItem } from '../types/toc';

/**
 * Regex Cấp 1 (Level 1) theo đúng Mục 3.2:
 * - Tiếng Việt: ^(LỜI NÓI ĐẦU|QUYẾT ĐỊNH|PHẦN\s+[IVXLCDM\d]+|CHƯƠNG\s+[IVXLCDM\d]+)\b.*
 * - Tiếng Anh:  ^(INTRODUCTION|PREFACE|PART\s+[IVXLCDM\d]+|CHAPTER\s+[IVXLCDM\d]+|CONCLUSION)\b.*
 */
const LEVEL_1_PATTERNS: RegExp[] = [
  /^(LỜI\s+NÓI\s+ĐẦU|QUYẾT\s+ĐỊNH|PHẦN\s+[IVXLCDM\d]+|CHƯƠNG\s+[IVXLCDM\d]+)(?:$|[\s:.\-–—]).*/iu,
  /^(INTRODUCTION|PREFACE|PART\s+[IVXLCDM\d]+|CHAPTER\s+[IVXLCDM\d]+|CONCLUSION)(?:$|[\s:.\-–—]).*/iu,
];

/**
 * Regex Cấp 2 (Level 2) theo đúng Mục 3.2:
 * - Tiếng Việt: ^(MỤC\s+\d+|ĐIỀU\s+\d+)\b.*
 * - Tiếng Anh:  ^(SECTION\s+\d+|ARTICLE\s+\d+)\b.*
 */
const LEVEL_2_PATTERNS: RegExp[] = [
  /^(MỤC\s+[IVXLCDM\d]+|ĐIỀU\s+\d+)(?:$|[\s:.\-–—]).*/iu,
  /^(SECTION\s+[IVXLCDM\d]+|ARTICLE\s+\d+)(?:$|[\s:.\-–—]).*/iu,
];

/**
 * Mẫu nhận diện dòng chỉ mới chứa tiền tố & số hiệu (cần ghép với dòng tiêu đề kế tiếp):
 * Ví dụ: "CHƯƠNG I", "PHẦN II.", "MỤC 1", "ĐIỀU 2:", "CHAPTER 1"
 */
const LEVEL_1_PREFIX_ONLY = /^(?:PHẦN|CHƯƠNG|PART|CHAPTER)\s+[IVXLCDM\d]+\s*[:.\-–—]?\s*$/iu;
const LEVEL_2_PREFIX_ONLY = /^(?:MỤC|ĐIỀU|SECTION|ARTICLE)\s+[IVXLCDM\d]+\s*[:.\-–—]?\s*$/iu;

/**
 * Các mẫu nhận diện chuỗi số trang ở vùng Header/Footer (9% đỉnh/đáy trang PDF)
 */
const PAGE_NUMBER_PATTERNS: RegExp[] = [
  /^\s*[-–—[()]?\s*(\d{1,4})\s*[-–—\])]?\s*$/u,
  /^\s*(?:trang|page|tr\.?|p\.?)\s*(\d{1,4})(?:\s*(?:\/|of|-)\s*\d{1,4})?\s*$/iu,
  /^\s*(\d{1,4})\s*\/\s*\d{1,4}\s*$/u,
];

export function cleanHeadingText(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function matchRegexLevel(text: string): 1 | 2 | null {
  const cleaned = cleanHeadingText(text);
  if (!cleaned) return null;

  for (const pat of LEVEL_1_PATTERNS) {
    if (pat.test(cleaned)) return 1;
  }
  for (const pat of LEVEL_2_PATTERNS) {
    if (pat.test(cleaned)) return 2;
  }
  return null;
}

export function isPrefixOnlyHeading(text: string, level: 1 | 2): boolean {
  const cleaned = cleanHeadingText(text);
  if (level === 1) return LEVEL_1_PREFIX_ONLY.test(cleaned);
  return LEVEL_2_PREFIX_ONLY.test(cleaned);
}

export function formatMergedTitle(prefixText: string, subtitleText: string): string {
  const prefixClean = cleanHeadingText(prefixText).replace(/[:.\-–—\s]+$/u, '');
  const subtitleClean = cleanHeadingText(subtitleText).replace(/^[:.\-–—\s]+/u, '');
  if (!subtitleClean) return prefixClean;
  return `${prefixClean}: ${subtitleClean}`;
}

function isAllUpperCaseText(text: string): boolean {
  const hasLetters = /\p{L}/u.test(text);
  return hasLetters && text === text.toUpperCase();
}

export function isLikelySubtitleContinuation(
  block: CandidateBlock,
  medianBodyFontSize = 13.0
): boolean {
  const text = cleanHeadingText(block.text);
  if (!text || text.length > 220) return false;
  if (matchRegexLevel(text) !== null) return false;

  const isUpper = isAllUpperCaseText(text);
  const isLarger = block.fontSize >= medianBodyFontSize + 0.5;
  return block.isBold || isUpper || isLarger;
}

/**
 * Phân tích danh sách các khối văn bản theo chiến lược 2 lớp (Mục 3.2)
 * kết hợp thuật toán ghép dòng tiêu đề bị ngắt (Title Merging - Mục 3.1).
 */
export function parseHeadingsFromBlocks(
  blocks: CandidateBlock[],
  medianBodyFontSize = 13.0
): HeadingItem[] {
  if (!blocks.length) return [];

  const hasExplicitStyles = blocks.some((b) => b.styleLevel === 1 || b.styleLevel === 2);
  const headings: HeadingItem[] = [];

  let idx = 0;
  while (idx < blocks.length) {
    const block = blocks[idx];
    const text = cleanHeadingText(block.text);
    if (!text) {
      idx++;
      continue;
    }

    let detectedLevel: 1 | 2 | null = null;

    // Lớp 1: Đọc từ Style Heading 1/2/3 hoặc PDF Bookmarks
    if (hasExplicitStyles && (block.styleLevel === 1 || block.styleLevel === 2)) {
      detectedLevel = block.styleLevel;
    }

    // Lớp 2: Regex đa ngôn ngữ + In đậm / Cỡ chữ lớn / In hoa
    if (detectedLevel === null) {
      const regexLevel = matchRegexLevel(text);
      if (regexLevel !== null) {
        const isEmphasized =
          block.isBold ||
          block.fontSize >= medianBodyFontSize + 0.5 ||
          isAllUpperCaseText(text) ||
          isPrefixOnlyHeading(text, regexLevel);

        if (isEmphasized) {
          detectedLevel = regexLevel;
        }
      }
    }

    if (detectedLevel !== null) {
      let finalTitle = text;
      let mergedNextIndex = -1;

      // Quy tắc ghép dòng tiêu đề (Title Merging):
      // Ví dụ dòng 1: "CHƯƠNG I", dòng 2: "CHẾ ĐỘ CHÍNH TRỊ" -> "CHƯƠNG I: CHẾ ĐỘ CHÍNH TRỊ"
      if (isPrefixOnlyHeading(text, detectedLevel) && idx + 1 < blocks.length) {
        const nextBlock = blocks[idx + 1];
        const samePage = nextBlock.pageNumber === block.pageNumber;
        if (samePage && isLikelySubtitleContinuation(nextBlock, medianBodyFontSize)) {
          finalTitle = formatMergedTitle(text, nextBlock.text);
          mergedNextIndex = nextBlock.paragraphIndex;
          idx++; // Bỏ qua dòng kế tiếp vì đã ghép
        }
      }

      headings.push({
        id: `h-${headings.length + 1}-${block.paragraphIndex}`,
        level: detectedLevel,
        title: finalTitle,
        pageNumber: block.pageNumber,
        paragraphIndex: block.paragraphIndex,
        mergedNextIndex,
      });
    }

    idx++;
  }

  return headings;
}

/**
 * Kiểm tra một chuỗi ngắn ở vùng Header/Footer có phải số trang hay không.
 */
export function extractPageNumberFromMarginText(text: string): number | null {
  const cleaned = cleanHeadingText(text);
  if (!cleaned || cleaned.length > 30) return null;

  for (const pat of PAGE_NUMBER_PATTERNS) {
    const m = cleaned.match(pat);
    if (m && m[1]) {
      const val = parseInt(m[1], 10);
      if (!Number.isNaN(val) && val >= 1 && val <= 9999) {
        return val;
      }
    }
  }
  return null;
}

/**
 * Lấy tên cơ sở <Base_Name> của tệp tin (không bao gồm phần mở rộng).
 */
export function getBaseName(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot <= 0) return fileName.trim();
  return fileName.slice(0, lastDot).trim();
}

/**
 * Chuẩn hóa tiêu đề văn bản thành chuỗi tên tệp đẹp mắt dạng Title_Case
 * Ví dụ: "LUẬT SỞ HỮU TRÍ TUỆ" -> "Luật_Sở_Hữu_Trí_Tuệ"
 */
export function sanitizeTitleForFileName(title: string): string {
  if (!title) return '';
  // Xóa các ký tự cấm và dấu chấm, phẩy, hai chấm, gạch chéo trong tên file
  const safe = title.replace(/[\\/:*?"<>|#%&{}\\$!'@+`=~;^.,()\[\]]/g, ' ').trim();
  const words = safe.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const titleCased = words.map((w) => {
    const lower = w.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });
  return titleCased.join('_');
}

/**
 * Kiểm tra xem một chuỗi có phải là Tên văn bản hợp lệ hay không.
 * TUYỆT ĐỐI BÁC BỎ các đề mục nội dung như "Điều 1...", "Chương I...", "Phần...", v.v.
 */
export function isValidDocumentTitle(title?: string | null): boolean {
  if (!title) return false;
  const clean = cleanHeadingText(title);
  if (clean.length < 3 || clean.length > 250) return false;

  // Bác bỏ nếu bắt đầu bằng các từ khóa chỉ đề mục nội dung
  const headingPrefixRegex = /^(?:điều|chương|phần|mục|tiểu\s*mục|khoản|điểm|article|chapter|section|part)\b/iu;
  if (headingPrefixRegex.test(clean)) {
    return false;
  }

  // Bác bỏ nếu bắt đầu bằng chữ số (ví dụ: "1.", "1.1", "12/...")
  if (/^\d+[\s.:)\-]/.test(clean)) {
    return false;
  }

  // Bác bỏ nếu là Quốc hiệu, Tiêu ngữ
  if (/cộng\s*hòa\s*xã\s*hội|độc\s*lập\s*-\s*tự\s*do/iu.test(clean)) {
    return false;
  }

  return true;
}

export const FAMILIAR_LEGAL_TYPES = [
  'BỘ LUẬT',
  'LUẬT',
  'NGHỊ ĐỊNH',
  'THÔNG TƯ LIÊN TỊCH',
  'THÔNG TƯ',
  'QUYẾT ĐỊNH',
  'NGHỊ QUYẾT',
  'PHÁP LỆNH',
  'HIẾN PHÁP',
  'CHỈ THỊ',
  'QUY CHẾ',
  'THÔNG BÁO',
  'BÁO CÁO',
  'KẾ HOẠCH',
  'LAW',
  'CODE',
  'DECREE',
  'CIRCULAR',
  'DECISION',
  'RESOLUTION',
];

/**
 * Thuật toán quét trực tiếp Dòng 1 để tìm các CHỮ QUEN THUỘC (Loại văn bản: LUẬT, BỘ LUẬT, NGHỊ ĐỊNH...).
 * Khi thấy dòng chứa chữ quen thuộc, tự động đọc tiếp các dòng nội dung bên dưới (Dòng 2, Dòng 3)
 * và ghép lại thành một chuỗi Tên văn bản chính thức hoàn chỉnh nhất.
 */
export function extractOfficialDocumentTitle(
  lines: { text: string; isBold?: boolean; isCentered?: boolean; fontSize?: number }[]
): string | null {
  if (!lines || lines.length === 0) return null;
  const scanLimit = Math.min(lines.length, 50);

  // Mẫu dừng quét khi đã chạm đến phần căn cứ hoặc đề mục nội dung
  const stopAfterTitle = /^(?:căn\s*cứ|điều\s+\d+|chương\s+[ivxlcdm\d]+|phần\s+thứ)/iu;
  // Mẫu bỏ qua các dòng mở đầu hành chính (Quốc hiệu, tiêu ngữ, nơi gửi, số hiệu)
  const skipBeforeTitle = /^(?:cộng\s*hòa\s*xã\s*hội|độc\s*lập\s*-\s*tự\s*do|số\s*:|hà\s*nội,\s*ngày|ngày\s+\d+|chính\s*phủ|quốc\s*hội)/iu;

  // VÒNG 1: QUÉT TRỰC TIẾP TÌM DÒNG CÓ CHỮ QUEN THUỘC (LUẬT, BỘ LUẬT, NGHỊ ĐỊNH, THÔNG TƯ...)
  for (let i = 0; i < scanLimit; i++) {
    const rawText = cleanHeadingText(lines[i].text);
    if (!rawText) continue;
    if (stopAfterTitle.test(rawText)) break;
    if (skipBeforeTitle.test(rawText)) continue;

    const upper = rawText.toUpperCase();

    for (const kw of FAMILIAR_LEGAL_TYPES) {
      if (upper === kw || upper.startsWith(kw + ' ') || upper.startsWith(kw + ':')) {
        const remainder = upper.slice(kw.length).replace(/^[:.\-–—\s]+/u, '').trim();

        // Trường hợp 1A: Từ khóa quen thuộc đứng riêng 1 dòng (VD: dòng 1 là "NGHỊ ĐỊNH" hoặc "LUẬT" hoặc "BỘ LUẬT")
        if (remainder.length === 0 || /^SỐ\s*[\d/]+/iu.test(remainder)) {
          const collectedParts: string[] = [rawText];

          // Đọc tiếp các dòng nội dung ngay bên dưới (Dòng 2, Dòng 3...)
          for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
            const nextLine = cleanHeadingText(lines[j].text);
            if (!nextLine) continue;
            if (stopAfterTitle.test(nextLine)) break;
            if (skipBeforeTitle.test(nextLine)) break;

            collectedParts.push(nextLine);

            // Nếu đã thu thập được từ 2 dòng nội dung trở lên hoặc dòng kết thúc câu
            if (collectedParts.length >= 4) break;
          }

          if (collectedParts.length > 1) {
            const merged = collectedParts.join(' ').replace(/\s+/g, ' ').trim();
            if (isValidDocumentTitle(merged)) {
              return merged;
            }
          }
        } else {
          // Trường hợp 1B: Dòng 1 có cả chữ quen thuộc và một phần tên (VD: "LUẬT SỞ HỮU TRÍ TUỆ" hoặc "NGHỊ ĐỊNH VỀ CHỨNG KHOÁN...")
          const collectedParts: string[] = [rawText];
          for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
            const nextLine = cleanHeadingText(lines[j].text);
            if (!nextLine) continue;
            if (stopAfterTitle.test(nextLine)) break;
            if (skipBeforeTitle.test(nextLine)) break;

            // Nếu dòng tiếp theo là chữ in hoa hoặc in đậm tiếp nối tiêu đề
            const isUpper = nextLine === nextLine.toUpperCase() && /\p{L}/u.test(nextLine);
            if (nextLine.length < 120 && (isUpper || lines[j].isBold)) {
              collectedParts.push(nextLine);
            } else {
              break;
            }
          }
          const merged = collectedParts.join(' ').replace(/\s+/g, ' ').trim();
          if (isValidDocumentTitle(merged)) {
            return merged;
          }
        }
      }
    }
  }

  // VÒNG 2: Quét các dòng IN HOA hoặc IN ĐẬM nổi bật ở đầu tài liệu nếu không tìm thấy từ khóa quen thuộc
  for (let i = 0; i < scanLimit; i++) {
    const rawText = cleanHeadingText(lines[i].text);
    if (!rawText) continue;
    if (stopAfterTitle.test(rawText)) break;
    if (skipBeforeTitle.test(rawText)) continue;

    const isUpper = rawText === rawText.toUpperCase() && /\p{L}/u.test(rawText);
    const isBold = Boolean(lines[i].isBold);
    if ((isUpper || isBold) && rawText.length >= 6 && rawText.length <= 150) {
      if (isValidDocumentTitle(rawText)) {
        return rawText;
      }
    }
  }

  return null;
}

/**
 * Đảm bảo Tiêu đề văn bản không bao giờ bị khuyết từ Loại văn bản (LUẬT, BỘ LUẬT, NGHỊ ĐỊNH, THÔNG TƯ...).
 * Nếu AI hoặc bộ lọc chỉ lấy phần trích yếu (VD: "Quy định chi tiết thi hành một số điều của Luật Chứng khoán" hoặc "Sở hữu trí tuệ"),
 * hàm này sẽ tự động kiểm tra ngữ cảnh các dòng đầu hoặc mã file để bù khuyết từ loại văn bản tương ứng vào đầu.
 */
export function ensureDocumentTypePrefix(
  title: string,
  rawLinesOrContext?: string | { text: string }[]
): string {
  if (!title || !title.trim()) return '';
  const clean = cleanHeadingText(title);
  const upper = clean.toUpperCase();

  // Nếu chuỗi bắt đầu bằng "QUY ĐỊNH CHI TIẾT" thì đây là trích yếu của Nghị định, KHÔNG PHẢI loại văn bản!
  const isDetailDecree = /^QUY\s+ĐỊNH\s+CHI\s+TIẾT\b/iu.test(upper);

  if (!isDetailDecree) {
    const hasTypePrefix = /^(?:LUẬT|BỘ\s+LUẬT|NGHỊ\s+ĐỊNH|THÔNG\s+TƯ|QUYẾT\s+ĐỊNH|NGHỊ\s+QUYẾT|PHÁP\s+LỆNH|HIẾN\s+PHÁP|CHỈ\s+THỊ|QUY\s+CHẾ|BÁO\s+CÁO|KẾ\s+HOẠCH|LAW|CODE|DECREE|CIRCULAR|DECISION)\b/iu.test(
      upper
    );
    if (hasTypePrefix) {
      return clean;
    }
  }

  // Thu thập chuỗi ngữ cảnh từ các dòng đầu của tài liệu
  let contextStr = '';
  if (typeof rawLinesOrContext === 'string') {
    contextStr = rawLinesOrContext.toUpperCase();
  } else if (Array.isArray(rawLinesOrContext)) {
    contextStr = rawLinesOrContext
      .slice(0, 30)
      .map((l) => (typeof l === 'string' ? l : l.text || ''))
      .join('\n')
      .toUpperCase();
  }

  // 1. Kiểm tra xem trong ngữ cảnh các dòng đầu có từ khóa loại văn bản đứng riêng không
  if (/\bNGHỊ\s+ĐỊNH\b/iu.test(contextStr) || /NĐ-CP/iu.test(contextStr) || isDetailDecree) {
    return `Nghị định ${clean}`;
  }
  if (/\bBỘ\s+LUẬT\b/iu.test(contextStr)) {
    return `Bộ luật ${clean}`;
  }
  if (/\bLUẬT\b/iu.test(contextStr) || /\bQH\d+\b/iu.test(contextStr)) {
    return `Luật ${clean}`;
  }
  if (/\bTHÔNG\s+TƯ\b/iu.test(contextStr) || /TT-[A-Z]+/iu.test(contextStr)) {
    return `Thông tư ${clean}`;
  }
  if (/\bQUYẾT\s+ĐỊNH\b/iu.test(contextStr) || /QĐ-[A-Z]+/iu.test(contextStr)) {
    return `Quyết định ${clean}`;
  }
  if (/\bNGHỊ\s+QUYẾT\b/iu.test(contextStr) || /NQ-[A-Z]+/iu.test(contextStr)) {
    return `Nghị quyết ${clean}`;
  }

  return clean;
}

/**
 * Kiểm tra xem tên tệp gốc có phải là dạng mã số / ký hiệu văn bản kỹ thuật
 * Ví dụ: "91_2015_QH13_296215", "15_2020_ND_CP", "01_2024_QD_UBND"
 */
export function isCodeLikeFileName(baseName: string): boolean {
  if (!baseName) return false;
  const hasDigits = /\d{2,}/.test(baseName);
  const isCodePattern = /^[\d_A-Za-z.\-]+$/.test(baseName);
  return hasDigits && isCodePattern;
}

/**
 * Loại bỏ dấu tiếng Việt để so sánh chuỗi chính xác
 */
function removeVietnameseTones(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase();
}

/**
 * Tạo tên tệp thông minh:
 * - Nếu tên file gốc CÓ CHỨA CON SỐ (Mã số, ký hiệu): Ghép <Mã_Gốc>_<Tên_Văn_Bản>
 *   Ví dụ: 158.signed -> 158.signed_Nghị_Định_Về_Chứng_Khoán...
 *          67_VBHN-VPQH_700846 -> 67_VBHN-VPQH_700846_Luật_Sở_Hữu_Trí_Tuệ
 * - Nếu tên file gốc THUẦN CHỮ (không có số): Trả về thẳng tên văn bản chữ đã chuẩn hóa Title Case
 *   Ví dụ: Luat_So_Huu_Tri_Tue -> Luật_Sở_Hữu_Trí_Tuệ
 */
export function formatSmartBaseName(originalBaseName: string, documentTitle?: string | null): string {
  if (!documentTitle || !isValidDocumentTitle(documentTitle)) {
    return originalBaseName;
  }
  const cleanTitle = sanitizeTitleForFileName(documentTitle);
  if (!cleanTitle) return originalBaseName;

  const hasDigits = /\d+/.test(originalBaseName);
  if (!hasDigits) {
    // Tên file gốc ban đầu là chữ (không có số): chỉ lấy tên file chữ, không cần ghép tiền tố
    return cleanTitle;
  }

  // Nếu tên gốc có số nhưng đã chứa sẵn tiêu đề này thì không lặp lại
  const normalizedOriginal = removeVietnameseTones(originalBaseName).replace(/[^a-z0-9]/g, '');
  const normalizedTitle = removeVietnameseTones(cleanTitle).replace(/[^a-z0-9]/g, '');
  if (normalizedOriginal.includes(normalizedTitle)) {
    return originalBaseName;
  }

  return `${originalBaseName}_${cleanTitle}`;
}

/**
 * Chuyển đổi tên tệp thông minh thành tiêu đề hiển thị trang trọng bên trong tài liệu (PDF & Word):
 * - Nếu tên file gốc ban đầu CÓ SỐ: Ghép <MÃ_GỐC>_<TÊN VĂN BẢN CÓ KHOẢNG TRẮNG>
 *   Ví dụ: "158.SIGNED_NGHỊ ĐỊNH VỀ CHỨNG KHOÁN PHÁI SINH VÀ THỊ TRƯỜNG CHỨNG KHOÁN PHÁI SINH"
 * - Nếu tên file gốc ban đầu LÀ CHỮ (không có số): Chỉ ghi tên văn bản chữ, không cần số và không có dấu '_'
 *   Ví dụ: "LUẬT SỞ HỮU TRÍ TUỆ", "BÁO CÁO TÀI CHÍNH NĂM 2024"
 */
export function formatDisplayTitle(baseName: string, docTitle?: string | null): string {
  const hasDigits = /\d+/.test(baseName);

  if (docTitle && isValidDocumentTitle(docTitle)) {
    const cleanDoc = cleanHeadingText(docTitle).toUpperCase();
    if (!hasDigits) {
      // File ban đầu là chữ: chỉ hiển thị tên chữ thuần túy
      return cleanDoc;
    }
    const cleanBase = baseName.trim().toUpperCase();
    const normBase = removeVietnameseTones(cleanBase).replace(/[^A-Z0-9]/g, '');
    const normTitle = removeVietnameseTones(cleanDoc).replace(/[^A-Z0-9]/g, '');
    if (!normBase.includes(normTitle)) {
      return `${cleanBase}_${cleanDoc}`;
    }
    return cleanDoc;
  }

  const trimmed = baseName.trim();
  const kwRegex = /_(LUẬT|BỘ_LUẬT|NGHỊ_ĐỊNH|THÔNG_TƯ|QUYẾT_ĐỊNH|NGHỊ_QUYẾT|HIẾN_PHÁP|CHỈ_THỊ|QUY_CHẾ|QUY_ĐỊNH|BÁO_CÁO|KẾ_HOẠCH|LAW|DECREE|CIRCULAR|DECISION|CODE)(_.*)$/i;
  const kwMatch = trimmed.match(kwRegex);
  if (kwMatch && kwMatch.index !== undefined) {
    const splitIdx = kwMatch.index;
    const codePart = trimmed.slice(0, splitIdx);
    const titlePart = trimmed.slice(splitIdx + 1).replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
    if (/\d+/.test(codePart)) {
      return `${codePart.toUpperCase()}_${titlePart}`;
    }
    return titlePart;
  }

  const firstUnder = trimmed.indexOf('_');
  if (firstUnder > 0 && firstUnder < trimmed.length - 1) {
    const codePart = trimmed.slice(0, firstUnder);
    const titlePart = trimmed.slice(firstUnder + 1).replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
    if (/\d+/.test(codePart)) {
      return `${codePart.toUpperCase()}_${titlePart}`;
    }
    return trimmed.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  }

  return trimmed.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
}

