import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  TextRun,
  convertMillimetersToTwip,
} from 'docx';
import { PDFDocument, rgb } from 'pdf-lib';
import { embedVietnameseSerifFonts, safePdfText } from './fontLoader';

/**
 * Tạo tệp Word mẫu (`Hiến pháp 2013.docx`) với các tiêu đề bị ngắt làm 2 dòng
 * (VD: dòng 1 "CHƯƠNG I", dòng 2 "CHẾ ĐỘ CHÍNH TRỊ") để kiểm thử trực tiếp Luồng A.
 */
export async function createSampleWordFile(): Promise<File> {
  const makePara = (text: string, bold = false, sizePt = 13, center = false) =>
    new Paragraph({
      alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
      spacing: { before: 80, after: 80 },
      children: [
        new TextRun({
          text,
          font: 'Times New Roman',
          size: sizePt * 2,
          bold,
        }),
      ],
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
          },
        },
        children: [
          makePara('HIẾN PHÁP NƯỚC CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', true, 14, true),
          makePara('LỜI NÓI ĐẦU', true, 14, false),
          makePara(
            'Trải qua mấy nghìn năm lịch sử, Nhân dân Việt Nam lao động cần cù, sáng tạo, chiến đấu anh dũng để dựng nước và giữ nước, đã hun đúc nên truyền thống yêu nước, đoàn kết, nhân nghĩa, kiên cường, bất khuất.',
            false,
            13
          ),
          makePara('CHƯƠNG I', true, 14, true),
          makePara('CHẾ ĐỘ CHÍNH TRỊ', true, 14, true),
          makePara('Điều 1. Chủ quyền quốc gia', true, 13, false),
          makePara(
            'Nước Cộng hòa xã hội chủ nghĩa Việt Nam là một nước độc lập, có chủ quyền, thống nhất và toàn vẹn lãnh thổ, bao gồm đất liền, hải đảo, vùng biển và vùng trời.',
            false,
            13
          ),
          makePara('Điều 2. Bản chất Nhà nước pháp quyền', true, 13, false),
          makePara(
            'Nhà nước Cộng hòa xã hội chủ nghĩa Việt Nam là nhà nước pháp quyền xã hội chủ nghĩa của Nhân dân, do Nhân dân, vì Nhân dân.',
            false,
            13
          ),
          makePara('CHƯƠNG II', true, 14, true),
          makePara(
            'QUYỀN CON NGƯỜI, QUYỀN VÀ NGHĨA VỤ CƠ BẢN CỦA CÔNG DÂN',
            true,
            14,
            true
          ),
          makePara('MỤC 1', true, 13.5, false),
          makePara('NGUYÊN TẮC CÔNG NHẬN VÀ BẢO ĐẢM QUYỀN CON NGƯỜI', true, 13.5, false),
          makePara('Điều 14. Tôn trọng và bảo vệ quyền con người', true, 13, false),
          makePara(
            'Ở nước Cộng hòa xã hội chủ nghĩa Việt Nam, các quyền con người, quyền công dân về chính trị, dân sự, kinh tế, văn hóa, xã hội được công nhận, tôn trọng, bảo vệ, bảo đảm theo Hiến pháp và pháp luật.',
            false,
            13
          ),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  return new File([blob], 'Hiến pháp 2013.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

/**
 * Tạo tệp PDF mẫu (`21_QD-VKSTC_553974.pdf`) có con dấu đỏ mô phỏng,
 * các tiêu đề bị ngắt dòng và tuỳ chọn đã có/chưa có số trang để kiểm thử Luồng B.
 */
export async function createSamplePdfFile(withExistingPageNumbers = false): Promise<File> {
  const pdfDoc = await PDFDocument.create();
  const { regular, bold, isUnicode } = await embedVietnameseSerifFonts(pdfDoc);

  // Trang 1
  const page1 = pdfDoc.addPage([595.28, 841.89]);
  const draw = (
    p: typeof page1,
    txt: string,
    x: number,
    y: number,
    isBold = false,
    size = 13
  ) => {
    p.drawText(safePdfText(txt, isUnicode), {
      x,
      y,
      size,
      font: isBold ? bold : regular,
      color: rgb(0, 0, 0),
    });
  };

  draw(page1, 'VIỆN KIỂM SÁT NHÂN DÂN TỐI CAO', 85, 775, true, 13);
  draw(page1, 'QUYẾT ĐỊNH', 250, 735, true, 14);
  draw(page1, 'CHƯƠNG I', 255, 690, true, 14);
  draw(page1, 'QUY ĐỊNH CHUNG VỀ QUY TRÌNH KIỂM SÁT', 145, 668, true, 14);
  draw(page1, 'Điều 1. Phạm vi điều chỉnh và đối tượng áp dụng', 85, 625, true, 13);
  draw(
    page1,
    'Quyết định này quy định chi tiết quy trình tiếp nhận, phân loại và giải quyết hồ sơ hành chính.',
    85,
    600,
    false,
    13
  );
  draw(page1, 'Điều 2. Giải thích từ ngữ chuyên ngành', 85, 555, true, 13);
  draw(
    page1,
    'Các thuật ngữ pháp lý trong văn bản này được áp dụng thống nhất trên toàn hệ thống.',
    85,
    530,
    false,
    13
  );

  // Trang 2
  const page2 = pdfDoc.addPage([595.28, 841.89]);
  draw(page2, 'CHƯƠNG II', 252, 760, true, 14);
  draw(page2, 'TRÌNH TỰ THỰC HIỆN VÀ TRÁCH NHIỆM CỦA CÁC ĐƠN VỊ', 110, 738, true, 14);
  draw(page2, 'MỤC 1', 85, 695, true, 13.5);
  draw(page2, 'TIẾP NHẬN VÀ XỬ LÝ TÀI LIỆU ĐẦU VÀO', 85, 675, true, 13.5);
  draw(page2, 'Điều 3. Trách nhiệm của bộ phận văn thư lưu trữ', 85, 635, true, 13);
  draw(
    page2,
    'Bộ phận văn thư có trách nhiệm kiểm tra thể thức, con dấu và chữ ký trước khi số hóa.',
    85,
    610,
    false,
    13
  );

  // Vẽ mô phỏng Con dấu đỏ ở cuối trang 2 để kiểm chứng bảo toàn 100% vector/con dấu
  page2.drawCircle({
    x: 430,
    y: 480,
    size: 42,
    borderColor: rgb(0.82, 0.1, 0.1),
    borderWidth: 2.2,
  });
  page2.drawText(safePdfText('CON DẤU ĐỎ BẢN GỐC', isUnicode), {
    x: 392,
    y: 477,
    size: 7.5,
    font: bold,
    color: rgb(0.82, 0.1, 0.1),
  });

  if (withExistingPageNumbers) {
    draw(page1, 'Trang 1', 278, 32, false, 11);
    draw(page2, 'Trang 2', 278, 32, false, 11);
  }

  const bytes = await pdfDoc.save();
  const fileName = withExistingPageNumbers
    ? '21_QD-VKSTC_CoSoTrang.pdf'
    : '21_QD-VKSTC_553974.pdf';
  return new File([bytes as unknown as BlobPart], fileName, { type: 'application/pdf' });
}
