import {
  AlignmentType,
  Document,
  LeaderType,
  Packer,
  Paragraph,
  TabStopType,
  TextRun,
  convertMillimetersToTwip,
} from 'docx';
import JSZip from 'jszip';
import { HeadingItem } from '../types/toc';
import { formatDisplayTitle } from './headingParser';

const FONT_NAME = 'Times New Roman';
// A4: 210mm, Lề trái 30mm, Lề phải 20mm -> Độ rộng dòng = 160mm
const RIGHT_TAB_POS_TWIP = convertMillimetersToTwip(160);
const RIGHT_INDENT_WRAP_TWIP = convertMillimetersToTwip(12);
const LEVEL2_LEFT_INDENT_TWIP = convertMillimetersToTwip(6);

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * LUỒNG B: Tạo tệp Word Mục lục rời `[Mục Lục] <Base_Name>.docx`
 * - Font Times New Roman 13-14pt
 * - Tiêu đề Tên tài liệu + MỤC LỤC (In hoa, in đậm, căn giữa)
 * - Từng dòng mục lục có Tab Stop lề phải kèm đường dẫn chấm bi (LeaderType.DOT)
 * - Không đánh số trang trên tệp mục lục rời này.
 */
export async function buildStandaloneTocDocx(
  baseName: string,
  headings: HeadingItem[]
): Promise<Blob> {
  const displayTitle = formatDisplayTitle(baseName);
  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 40, after: 80 },
      children: [
        new TextRun({
          text: displayTitle,
          font: FONT_NAME,
          size: 28, // 14pt
          bold: true,
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 280 },
      children: [
        new TextRun({
          text: 'MỤC LỤC',
          font: FONT_NAME,
          size: 28, // 14pt
          bold: true,
        }),
      ],
    }),
  ];

  if (headings.length === 0) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 120, after: 120 },
        children: [
          new TextRun({
            text: '(Không tìm thấy đề mục tự động trong tài liệu)',
            font: FONT_NAME,
            size: 26, // 13pt
            italics: true,
          }),
        ],
      })
    );
  } else {
    for (const item of headings) {
      const isL1 = item.level === 1;
      const fontSizeHalfPt = isL1 ? 27 : 26; // 13.5pt cho Cấp 1, 13pt cho Cấp 2

      children.push(
        new Paragraph({
          alignment: AlignmentType.LEFT,
          indent: {
            left: isL1 ? 0 : LEVEL2_LEFT_INDENT_TWIP,
            right: RIGHT_INDENT_WRAP_TWIP,
            hanging: 0,
          },
          spacing: {
            before: isL1 ? 100 : 60,
            after: isL1 ? 80 : 60,
            line: 312, // ~1.3 line spacing
          },
          tabStops: [
            {
              type: TabStopType.RIGHT,
              position: RIGHT_TAB_POS_TWIP,
              leader: LeaderType.DOT,
            },
          ],
          children: [
            new TextRun({
              text: item.title,
              font: FONT_NAME,
              size: fontSizeHalfPt,
              bold: isL1,
            }),
            new TextRun({
              text: `\t${item.pageNumber}`,
              font: FONT_NAME,
              size: fontSizeHalfPt,
              bold: isL1,
            }),
          ],
        })
      );
    }
  }

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

  return Packer.toBlob(doc);
}

/**
 * Xây dựng khối XML cho các đoạn văn Trang Mục lục (Trang 1) và Ngắt trang (Page Break)
 * theo chuẩn OpenXML (Times New Roman, 13-14pt, Tab Leader chấm bi).
 */
function buildTocXmlFragment(baseName: string, headings: HeadingItem[]): string {
  const displayTitle = formatDisplayTitle(baseName);
  const titleUpper = escapeXml(displayTitle);

  const makeRunProps = (sizeHalfPt: number, bold: boolean, italic = false) => `
    <w:rPr>
      <w:rFonts w:ascii="${FONT_NAME}" w:hAnsi="${FONT_NAME}" w:cs="${FONT_NAME}" w:eastAsia="${FONT_NAME}"/>
      ${bold ? '<w:b/><w:bCs/>' : ''}
      ${italic ? '<w:i/><w:iCs/>' : ''}
      <w:sz w:val="${sizeHalfPt}"/>
      <w:szCs w:val="${sizeHalfPt}"/>
    </w:rPr>
  `;

  const headerParagraphs = `
    <w:p>
      <w:pPr>
        <w:jc w:val="center"/>
        <w:spacing w:before="40" w:after="80"/>
      </w:pPr>
      <w:r>
        ${makeRunProps(28, true)}
        <w:t>${titleUpper}</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr>
        <w:jc w:val="center"/>
        <w:spacing w:before="0" w:after="260"/>
      </w:pPr>
      <w:r>
        ${makeRunProps(28, true)}
        <w:t>MỤC LỤC</w:t>
      </w:r>
    </w:p>
  `;

  // Trường TOC tự động của Word kèm các dòng kết xuất sẵn chuẩn Tab Leader chấm bi
  const tocFieldStart = `
    <w:p>
      <w:r>
        <w:fldChar w:fldCharType="begin"/>
      </w:r>
      <w:r>
        <w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText>
      </w:r>
      <w:r>
        <w:fldChar w:fldCharType="separate"/>
      </w:r>
    </w:p>
  `;

  let entriesXml = '';
  if (headings.length === 0) {
    entriesXml = `
      <w:p>
        <w:pPr>
          <w:jc w:val="center"/>
          <w:spacing w:before="120" w:after="120"/>
        </w:pPr>
        <w:r>
          ${makeRunProps(26, false, true)}
          <w:t>(Không tìm thấy đề mục tự động trong tài liệu)</w:t>
        </w:r>
      </w:p>
    `;
  } else {
    for (const h of headings) {
      const isL1 = h.level === 1;
      const sz = isL1 ? 27 : 26;
      const leftIndent = isL1 ? 0 : LEVEL2_LEFT_INDENT_TWIP;
      const before = isL1 ? 100 : 60;
      const after = isL1 ? 80 : 60;
      const safeTitle = escapeXml(h.title);

      entriesXml += `
        <w:p>
          <w:pPr>
            <w:tabs>
              <w:tab w:val="right" w:leader="dot" w:pos="${RIGHT_TAB_POS_TWIP}"/>
            </w:tabs>
            <w:ind w:left="${leftIndent}" w:right="${RIGHT_INDENT_WRAP_TWIP}"/>
            <w:spacing w:before="${before}" w:after="${after}" w:line="312" w:lineRule="auto"/>
          </w:pPr>
          <w:r>
            ${makeRunProps(sz, isL1)}
            <w:t>${safeTitle}</w:t>
          </w:r>
          <w:r>
            ${makeRunProps(sz, isL1)}
            <w:tab/>
          </w:r>
          <w:r>
            ${makeRunProps(sz, isL1)}
            <w:t>${h.pageNumber}</w:t>
          </w:r>
        </w:p>
      `;
    }
  }

  const tocFieldEndAndPageBreak = `
    <w:p>
      <w:r>
        <w:fldChar w:fldCharType="end"/>
      </w:r>
      <w:r>
        <w:br w:type="page"/>
      </w:r>
    </w:p>
  `;

  return `<w:root xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${headerParagraphs}${tocFieldStart}${entriesXml}${tocFieldEndAndPageBreak}</w:root>`;
}

/**
 * Tạo nội dung tệp `word/footer_autotoc.xml` chứa trường số trang (`PAGE`)
 * căn Chính giữa chân trang (Footer - Center), font Times New Roman 11pt.
 */
function buildCenterPageNumberFooterXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr>
      <w:jc w:val="center"/>
    </w:pPr>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="${FONT_NAME}" w:hAnsi="${FONT_NAME}" w:cs="${FONT_NAME}" w:eastAsia="${FONT_NAME}"/>
        <w:sz w:val="22"/>
        <w:szCs w:val="22"/>
      </w:rPr>
      <w:fldChar w:fldCharType="begin"/>
    </w:r>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="${FONT_NAME}" w:hAnsi="${FONT_NAME}" w:cs="${FONT_NAME}" w:eastAsia="${FONT_NAME}"/>
        <w:sz w:val="22"/>
        <w:szCs w:val="22"/>
      </w:rPr>
      <w:instrText xml:space="preserve"> PAGE </w:instrText>
    </w:r>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="${FONT_NAME}" w:hAnsi="${FONT_NAME}" w:cs="${FONT_NAME}" w:eastAsia="${FONT_NAME}"/>
        <w:sz w:val="22"/>
        <w:szCs w:val="22"/>
      </w:rPr>
      <w:fldChar w:fldCharType="separate"/>
    </w:r>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="${FONT_NAME}" w:hAnsi="${FONT_NAME}" w:cs="${FONT_NAME}" w:eastAsia="${FONT_NAME}"/>
        <w:sz w:val="22"/>
        <w:szCs w:val="22"/>
      </w:rPr>
      <w:t>1</w:t>
    </w:r>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="${FONT_NAME}" w:hAnsi="${FONT_NAME}" w:cs="${FONT_NAME}" w:eastAsia="${FONT_NAME}"/>
        <w:sz w:val="22"/>
        <w:szCs w:val="22"/>
      </w:rPr>
      <w:fldChar w:fldCharType="end"/>
    </w:r>
  </w:p>
</w:ftr>`;
}

/**
 * Bật thuộc tính in đậm (<w:b/> & <w:bCs/>) cho mọi run có chữ bên trong một thẻ <w:p>
 * ở phần thân bài Word, giữ nguyên 100% font, cỡ chữ, căn lề và nội dung gốc.
 */
function applyBoldToParagraphElement(xmlDoc: globalThis.Document, pEl: Element, wNs: string): void {
  const runs = Array.from(pEl.getElementsByTagNameNS(wNs, 'r'));
  for (const rEl of runs) {
    const tEls = Array.from(rEl.getElementsByTagNameNS(wNs, 't'));
    const hasText = tEls.some((t) => (t.textContent || '').trim().length > 0);
    if (!hasText) continue;

    let rPr = Array.from(rEl.childNodes).find(
      (n) => n.nodeType === 1 && (n as Element).localName === 'rPr'
    ) as Element | undefined;

    if (!rPr) {
      rPr = xmlDoc.createElementNS(wNs, 'w:rPr');
      rEl.insertBefore(rPr, rEl.firstChild);
    }

    let bEl = Array.from(rPr.childNodes).find(
      (n) => n.nodeType === 1 && (n as Element).localName === 'b'
    ) as Element | undefined;
    if (!bEl) {
      bEl = xmlDoc.createElementNS(wNs, 'w:b');
      rPr.appendChild(bEl);
    } else {
      bEl.removeAttribute('w:val');
      bEl.removeAttribute('val');
    }

    let bCsEl = Array.from(rPr.childNodes).find(
      (n) => n.nodeType === 1 && (n as Element).localName === 'bCs'
    ) as Element | undefined;
    if (!bCsEl) {
      bCsEl = xmlDoc.createElementNS(wNs, 'w:bCs');
      rPr.appendChild(bCsEl);
    } else {
      bCsEl.removeAttribute('w:val');
      bCsEl.removeAttribute('val');
    }
  }
}

/**
 * LUỒNG A: Can thiệp cấu trúc OOXML của tệp Word (.docx) để:
 * 1. In đậm toàn bộ đề mục Chương / Mục / Điều trong thân bài (giữ Mục lục chỉ in đậm Cấp 1).
 * 2. Chèn Mục lục tự động (TOC) vào Trang 1 + Page Break đẩy toàn bộ nội dung gốc sang Trang 2.
 * 3. Thiết lập đánh số trang tự động liên tục từ 1 tại Chính giữa chân trang (Footer - Center).
 */
export async function injectTocAndFooterIntoDocx(
  sourceZip: JSZip,
  baseName: string,
  headings: HeadingItem[]
): Promise<Blob> {
  const zip = await JSZip.loadAsync(await sourceZip.generateAsync({ type: 'arraybuffer' }));
  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) {
    throw new Error('Không tìm thấy word/document.xml trong tệp Word.');
  }

  const docXmlStr = await docXmlFile.async('string');
  const parser = new DOMParser();
  const serializer = new XMLSerializer();
  const xmlDoc = parser.parseFromString(docXmlStr, 'application/xml');
  const wNs = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const rNs = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  const body = xmlDoc.getElementsByTagNameNS(wNs, 'body')[0];
  if (!body) {
    throw new Error('Cấu trúc tệp Word không hợp lệ (thiếu thẻ w:body).');
  }

  // Lấy danh sách các thẻ <w:p> trực tiếp trong <w:body>
  const directParagraphs: Element[] = [];
  for (let i = 0; i < body.childNodes.length; i++) {
    const node = body.childNodes[i];
    if (node.nodeType === 1 && (node as Element).localName === 'p') {
      directParagraphs.push(node as Element);
    }
  }

  // Tô đậm các đoạn đề mục (Cấp 1 & Cấp 2: Chương, Mục, Điều...) trong phần thân bài gốc,
  // vẫn giữ nguyên vẹn 100% font chữ, cỡ chữ, bảng biểu, hình ảnh và văn bản gốc.
  const bodyBoldIndices = new Set<number>();
  for (const h of headings) {
    if (h.paragraphIndex !== undefined && h.paragraphIndex >= 0) {
      bodyBoldIndices.add(h.paragraphIndex);
    }
    if (h.mergedNextIndex !== undefined && h.mergedNextIndex >= 0) {
      bodyBoldIndices.add(h.mergedNextIndex);
    }
    if (h.mergedIndices) {
      for (const mIdx of h.mergedIndices) {
        if (mIdx >= 0) {
          bodyBoldIndices.add(mIdx);
        }
      }
    }
  }
  for (const pIdx of bodyBoldIndices) {
    if (pIdx >= 0 && pIdx < directParagraphs.length) {
      applyBoldToParagraphElement(xmlDoc, directParagraphs[pIdx], wNs);
    }
  }

  // 1. Chèn các đoạn văn Mục lục + Page Break vào vị trí đầu tiên của <w:body> (Trang 1)
  const tocWrapperDoc = parser.parseFromString(
    buildTocXmlFragment(baseName, headings),
    'application/xml'
  );
  const tocRoot = tocWrapperDoc.documentElement;
  const firstBodyChild = body.firstChild;

  const tocNodes = Array.from(tocRoot.childNodes);
  for (const node of tocNodes) {
    if (node.nodeType === 1) {
      const imported = xmlDoc.importNode(node, true);
      if (firstBodyChild) {
        body.insertBefore(imported, firstBodyChild);
      } else {
        body.appendChild(imported);
      }
    }
  }

  // 2. Kiểm tra xem tài liệu gốc đã có Footer hay chưa.
  // Nếu đã có Footer gốc -> GIỮ NGUYÊN 100%, tuyệt đối không xóa hay ghi đè!
  const sectPrList = Array.from(body.getElementsByTagNameNS(wNs, 'sectPr'));
  const hasExistingFooter = sectPrList.some(
    (sectPr) => sectPr.getElementsByTagNameNS(wNs, 'footerReference').length > 0
  );

  if (!hasExistingFooter) {
    const footerFileName = 'footer_autotoc.xml';
    const footerRelId = 'rIdAutoTocFooter99';
    zip.file(`word/${footerFileName}`, buildCenterPageNumberFooterXml());

    // Cập nhật word/_rels/document.xml.rels
    const relsPath = 'word/_rels/document.xml.rels';
    const relsFile = zip.file(relsPath);
    if (relsFile) {
      const relsStr = await relsFile.async('string');
      const relsDoc = parser.parseFromString(relsStr, 'application/xml');
      const relsRoot = relsDoc.documentElement;
      const relNs = 'http://schemas.openxmlformats.org/package/2006/relationships';

      const newRel = relsDoc.createElementNS(relNs, 'Relationship');
      newRel.setAttribute('Id', footerRelId);
      newRel.setAttribute(
        'Type',
        'http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer'
      );
      newRel.setAttribute('Target', footerFileName);
      relsRoot.appendChild(newRel);

      zip.file(relsPath, serializer.serializeToString(relsDoc));
    }

    // Cập nhật [Content_Types].xml
    const contentTypesPath = '[Content_Types].xml';
    const ctFile = zip.file(contentTypesPath);
    if (ctFile) {
      const ctStr = await ctFile.async('string');
      const ctDoc = parser.parseFromString(ctStr, 'application/xml');
      const ctRoot = ctDoc.documentElement;
      const ctNs = 'http://schemas.openxmlformats.org/package/2006/content-types';

      const hasOverride = Array.from(ctRoot.getElementsByTagName('Override')).some(
        (el) => el.getAttribute('PartName') === `/word/${footerFileName}`
      );
      if (!hasOverride) {
        const overrideEl = ctDoc.createElementNS(ctNs, 'Override');
        overrideEl.setAttribute('PartName', `/word/${footerFileName}`);
        overrideEl.setAttribute(
          'ContentType',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml'
        );
        ctRoot.appendChild(overrideEl);
        zip.file(contentTypesPath, serializer.serializeToString(ctDoc));
      }
    }

    // Gắn w:footerReference và w:pgNumType (w:start="1") vào mọi thẻ w:sectPr trong tài liệu
    if (sectPrList.length === 0) {
      const newSectPr = xmlDoc.createElementNS(wNs, 'w:sectPr');
      body.appendChild(newSectPr);
      sectPrList.push(newSectPr);
    }

    sectPrList.forEach((sectPr, idx) => {
      const footerRef = xmlDoc.createElementNS(wNs, 'w:footerReference');
      footerRef.setAttribute('w:type', 'default');
      footerRef.setAttributeNS(rNs, 'r:id', footerRelId);
      sectPr.insertBefore(footerRef, sectPr.firstChild);

      // Đảm bảo trang đầu cũng hiển thị số trang (tắt titlePg nếu có)
      const titlePg = sectPr.getElementsByTagNameNS(wNs, 'titlePg')[0];
      if (titlePg) {
        titlePg.parentNode?.removeChild(titlePg);
      }

      if (idx === 0) {
        let pgNumType = sectPr.getElementsByTagNameNS(wNs, 'pgNumType')[0];
        if (!pgNumType) {
          pgNumType = xmlDoc.createElementNS(wNs, 'w:pgNumType');
          sectPr.appendChild(pgNumType);
        }
        pgNumType.setAttribute('w:start', '1');
      }
    });
  }

  // Bật cờ tự động cập nhật trường dữ liệu (w:updateFields) trong word/settings.xml khi mở bằng MS Word
  const settingsPath = 'word/settings.xml';
  const settingsFile = zip.file(settingsPath);
  if (settingsFile) {
    const settingsStr = await settingsFile.async('string');
    const settingsDoc = parser.parseFromString(settingsStr, 'application/xml');
    const settingsRoot = settingsDoc.documentElement;
    if (!settingsRoot.getElementsByTagNameNS(wNs, 'updateFields')[0]) {
      const upd = settingsDoc.createElementNS(wNs, 'w:updateFields');
      upd.setAttribute('w:val', 'true');
      settingsRoot.appendChild(upd);
      zip.file(settingsPath, serializer.serializeToString(settingsDoc));
    }
  }

  zip.file('word/document.xml', serializer.serializeToString(xmlDoc));

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
