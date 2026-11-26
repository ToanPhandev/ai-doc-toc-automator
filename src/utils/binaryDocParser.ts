export interface BinaryDocParagraphItem {
  text: string;
  isBold: boolean;
  isCentered: boolean;
  isRight: boolean;
  isHeadingCandidate: boolean;
}

const CFB_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const MAXREGSECT = 0xfffffffa;
const ENDOFCHAIN = 0xfffffffe;

const ADMIN_CELL_RE =
  /(?:CỘNG\s+HÒA\s+XÃ\s+HỘI|ĐỘC\s+LẬP\s*-\s*TỰ\s+DO|VĂN\s+PHÒNG|CHÍNH\s+PHỦ|QUỐC\s+HỘI|SỐ\s*:)/iu;

const NARRATIVE_CITATION_RE =
  /^(?:ĐIỀU|MỤC|CHƯƠNG|PHẦN)\s+[IVXLCDM\d]+(?:\s*(?:,|và)\s*(?:ĐIỀU|MỤC|CHƯƠNG|PHẦN)?\s*[IVXLCDM\d]+)*\s+của\s+(?:Luật|Bộ\s+luật|Nghị\s+định|Thông\s+tư|Pháp\s+lệnh|Nghị\s+quyết|Quyết\s+định)\b/iu;

/**
 * Kiểm tra 8 byte đầu có phải tệp OLE2 / Compound File Binary (.doc Word 97-2003) hay không.
 */
export function isOle2BinaryDoc(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 512) return false;
  const bytes = new Uint8Array(buffer, 0, 8);
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== CFB_MAGIC[i]) return false;
  }
  return true;
}

function readCfbStreams(buffer: ArrayBuffer): Map<string, Uint8Array> {
  const streams = new Map<string, Uint8Array>();
  if (buffer.byteLength < 512) return streams;

  const dv = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  const majorVersion = dv.getUint16(26, true);
  const sectorShift = dv.getUint16(30, true);
  const sectorSize = 1 << sectorShift;
  if (sectorSize < 512 || sectorSize > 4096) return streams;

  const miniSectorShift = dv.getUint16(32, true);
  const miniSectorSize = 1 << miniSectorShift;
  if (miniSectorSize < 32 || miniSectorSize > sectorSize) return streams;

  const firstDirSector = dv.getUint32(48, true);
  const miniStreamCutoff = dv.getUint32(56, true) || 4096;
  const firstMiniFatSector = dv.getUint32(60, true);
  const numMiniFatSectors = dv.getUint32(64, true);
  const firstDifatSector = dv.getUint32(68, true);
  const numDifatSectors = dv.getUint32(72, true);

  const sectorOffset = (secId: number): number => (secId + 1) * sectorSize;

  // 1. Thu thập danh sách FAT sector từ 109 ô DIFAT nội tuyến + các DIFAT sector nối tiếp
  const fatSectorIds: number[] = [];
  for (let i = 0; i < 109; i++) {
    const secId = dv.getUint32(76 + i * 4, true);
    if (secId <= MAXREGSECT) {
      fatSectorIds.push(secId);
    }
  }

  let difatSec = firstDifatSector;
  const visitedDifat = new Set<number>();
  let difatCount = 0;
  const entriesPerDifat = sectorSize / 4 - 1;
  while (difatSec <= MAXREGSECT && difatCount < numDifatSectors && !visitedDifat.has(difatSec)) {
    visitedDifat.add(difatSec);
    const off = sectorOffset(difatSec);
    if (off + sectorSize > bytes.length) break;
    for (let i = 0; i < entriesPerDifat; i++) {
      const secId = dv.getUint32(off + i * 4, true);
      if (secId <= MAXREGSECT) {
        fatSectorIds.push(secId);
      }
    }
    difatSec = dv.getUint32(off + entriesPerDifat * 4, true);
    difatCount++;
  }

  // 2. Dựng bảng FAT
  const fat: number[] = [];
  const entriesPerFat = sectorSize / 4;
  for (const fatSecId of fatSectorIds) {
    const off = sectorOffset(fatSecId);
    if (off + sectorSize > bytes.length) continue;
    for (let i = 0; i < entriesPerFat; i++) {
      fat.push(dv.getUint32(off + i * 4, true));
    }
  }

  const readFatChain = (startSec: number, maxBytes?: number): Uint8Array => {
    const chunks: Uint8Array[] = [];
    let total = 0;
    let cur = startSec;
    const visited = new Set<number>();

    while (cur <= MAXREGSECT && cur < fat.length && !visited.has(cur)) {
      visited.add(cur);
      const off = sectorOffset(cur);
      if (off + sectorSize > bytes.length) break;
      const chunk = bytes.subarray(off, off + sectorSize);
      chunks.push(chunk);
      total += chunk.length;
      if (maxBytes !== undefined && total >= maxBytes) break;
      const next = fat[cur];
      if (next === ENDOFCHAIN || next === undefined) break;
      cur = next;
    }

    const finalLen = maxBytes !== undefined ? Math.min(total, maxBytes) : total;
    const out = new Uint8Array(finalLen);
    let pos = 0;
    for (const c of chunks) {
      const take = Math.min(c.length, finalLen - pos);
      if (take <= 0) break;
      out.set(c.subarray(0, take), pos);
      pos += take;
    }
    return out;
  };

  // 3. Đọc Directory Stream
  const dirBytes = readFatChain(firstDirSector);
  if (dirBytes.length < 128) return streams;
  const dirDv = new DataView(dirBytes.buffer, dirBytes.byteOffset, dirBytes.byteLength);
  const utf16Decoder = new TextDecoder('utf-16le', { fatal: false });

  interface DirEntry {
    name: string;
    objType: number;
    startSector: number;
    streamSize: number;
  }

  const entries: DirEntry[] = [];
  let rootEntry: DirEntry | null = null;

  for (let off = 0; off + 128 <= dirBytes.length; off += 128) {
    const objType = dirBytes[off + 66];
    if (objType === 0) continue;

    const nameLen = dirDv.getUint16(off + 64, true);
    const clampedNameBytes = Math.min(64, Math.max(0, nameLen - 2));
    const name = utf16Decoder
      .decode(dirBytes.subarray(off, off + clampedNameBytes))
      .replace(/\0+$/g, '');

    const startSector = dirDv.getUint32(off + 116, true);
    const sizeLow = dirDv.getUint32(off + 120, true);
    const sizeHigh = majorVersion === 3 ? 0 : dirDv.getUint32(off + 124, true);
    const streamSize = sizeHigh * 0x100000000 + sizeLow;

    const entry: DirEntry = { name, objType, startSector, streamSize };
    if (objType === 5 && !rootEntry) {
      rootEntry = entry;
    } else if (objType === 2 && name) {
      entries.push(entry);
    }
  }

  // 4. Đọc MiniStream & MiniFAT nếu có
  const miniStream =
    rootEntry && rootEntry.startSector <= MAXREGSECT && rootEntry.streamSize > 0
      ? readFatChain(rootEntry.startSector, rootEntry.streamSize)
      : new Uint8Array(0);

  const miniFat: number[] = [];
  if (firstMiniFatSector <= MAXREGSECT && numMiniFatSectors > 0) {
    const miniFatBytes = readFatChain(firstMiniFatSector, numMiniFatSectors * sectorSize);
    const mfDv = new DataView(miniFatBytes.buffer, miniFatBytes.byteOffset, miniFatBytes.byteLength);
    for (let i = 0; i + 4 <= miniFatBytes.length; i += 4) {
      miniFat.push(mfDv.getUint32(i, true));
    }
  }

  const readMiniChain = (startMiniSec: number, maxBytes: number): Uint8Array => {
    const out = new Uint8Array(maxBytes);
    let pos = 0;
    let cur = startMiniSec;
    const visited = new Set<number>();

    while (cur <= MAXREGSECT && cur < miniFat.length && pos < maxBytes && !visited.has(cur)) {
      visited.add(cur);
      const off = cur * miniSectorSize;
      if (off + miniSectorSize > miniStream.length) break;
      const take = Math.min(miniSectorSize, maxBytes - pos);
      out.set(miniStream.subarray(off, off + take), pos);
      pos += take;
      const next = miniFat[cur];
      if (next === ENDOFCHAIN || next === undefined) break;
      cur = next;
    }
    return pos < maxBytes ? out.subarray(0, pos) : out;
  };

  for (const entry of entries) {
    if (entry.streamSize === 0) {
      streams.set(entry.name, new Uint8Array(0));
    } else if (
      entry.streamSize < miniStreamCutoff &&
      miniStream.length > 0 &&
      miniFat.length > 0
    ) {
      streams.set(entry.name, readMiniChain(entry.startSector, entry.streamSize));
    } else {
      streams.set(entry.name, readFatChain(entry.startSector, entry.streamSize));
    }
  }

  return streams;
}

/**
 * Loại bỏ các trường Word (\x13 instruction \x14 result \x15) theo ngăn xếp,
 * giữ lại phần kết quả hiển thị thực tế và loại bỏ mã lệnh HYPERLINK/PAGEREF/TOC.
 */
function stripWordFieldCodes(raw: string): string {
  const stack: boolean[] = []; // true = đang ở vùng instruction (ẩn), false = đang ở vùng result (hiện)
  const out: string[] = [];

  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i);
    if (code === 0x13) {
      stack.push(true);
    } else if (code === 0x14) {
      if (stack.length > 0) {
        stack[stack.length - 1] = false;
      }
    } else if (code === 0x15) {
      if (stack.length > 0) {
        stack.pop();
      }
    } else {
      const hidden = stack.some(Boolean);
      if (!hidden) {
        out.push(raw[i]);
      }
    }
  }

  return out.join('').replace(/\bHYPERLINK\s+\\l\s+"[^"]*"\s*/gi, '');
}

function cleanBinaryDocText(raw: string): string {
  const withoutFields = stripWordFieldCodes(raw);

  // Tách hàng bảng (\x07\x07) thành xuống dòng trước khi xử lý ô bảng (\x07)
  const normalizedRows = withoutFields.replace(/\x07\x07/g, '\n');

  const processedLines: string[] = [];
  const rawSegments = normalizedRows.split(/\r|\n|\x0b|\x0c/);

  for (const seg of rawSegments) {
    if (seg.includes('\x07')) {
      const cells = seg
        .split('\x07')
        .map((c) => c.replace(/[\x00-\x08\x0e-\x1f\x7f]/g, '').trim())
        .filter(Boolean);

      if (cells.length === 0) continue;

      const hasAdminHeader = cells.some((c) => ADMIN_CELL_RE.test(c));
      if (hasAdminHeader || cells.length === 1) {
        for (const c of cells) {
          processedLines.push(c);
        }
      } else {
        processedLines.push(cells.join('  |  '));
      }
    } else {
      const cleaned = seg.replace(/[\x00-\x08\x0e-\x1f\x7f]/g, '').trim();
      if (cleaned) {
        processedLines.push(cleaned);
      }
    }
  }

  return processedLines.join('\n');
}

/**
 * Giải mã cấu trúc Word 97-2003 nhị phân (FIB + Piece Table / CLX) để trích xuất
 * đúng 100% văn bản chính (ccpText), loại bỏ toàn bộ khối nhị phân rác ở đầu/cuối file.
 */
export function extractTextFromBinaryDoc(buffer: ArrayBuffer): string | null {
  if (!isOle2BinaryDoc(buffer)) return null;

  const streams = readCfbStreams(buffer);
  const wordDoc = streams.get('WordDocument');
  if (!wordDoc || wordDoc.length < 0x200) return null;

  const dv = new DataView(wordDoc.buffer, wordDoc.byteOffset, wordDoc.byteLength);
  const flags = dv.getUint16(0x000a, true);

  // Kiểm tra cờ mã hóa (fEncrypted)
  if ((flags & 0x0100) !== 0) return null;

  const preferredTableName = (flags & 0x0200) !== 0 ? '1Table' : '0Table';
  const tableStream =
    streams.get(preferredTableName) ?? streams.get('1Table') ?? streams.get('0Table');
  if (!tableStream || tableStream.length < 8) return null;

  // Đọc động các vùng FIB (FibBase -> FibRgW -> FibRgLw -> FibRgFcLcb)
  const csw = dv.getUint16(0x0020, true);
  const fibRgLwCountOff = 0x0022 + csw * 2;
  if (fibRgLwCountOff + 2 > wordDoc.length) return null;

  const cslw = dv.getUint16(fibRgLwCountOff, true);
  const fibRgLwStart = fibRgLwCountOff + 2;
  const ccpText =
    fibRgLwStart + 16 <= wordDoc.length
      ? dv.getUint32(fibRgLwStart + 12, true)
      : dv.getUint32(0x004c, true);

  if (ccpText === 0) return null;

  const fibRgFcLcbCountOff = fibRgLwStart + cslw * 4;
  if (fibRgFcLcbCountOff + 2 > wordDoc.length) return null;

  const cbRgFcLcb = dv.getUint16(fibRgFcLcbCountOff, true);
  const fibRgFcLcbStart = fibRgFcLcbCountOff + 2;
  const fcClxOff = cbRgFcLcb > 33 ? fibRgFcLcbStart + 33 * 8 : 0x01a2;
  if (fcClxOff + 8 > wordDoc.length) return null;

  const fcClx = dv.getUint32(fcClxOff, true);
  const lcbClx = dv.getUint32(fcClxOff + 4, true);
  if (lcbClx === 0 || fcClx + lcbClx > tableStream.length) return null;

  const tableDv = new DataView(tableStream.buffer, tableStream.byteOffset, tableStream.byteLength);
  let pos = fcClx;
  const clxEnd = fcClx + lcbClx;

  // Bỏ qua các khối Prc (clxt === 0x01)
  while (pos < clxEnd && tableStream[pos] === 0x01) {
    if (pos + 3 > clxEnd) return null;
    const cbGrpprl = tableDv.getInt16(pos + 1, true);
    if (cbGrpprl < 0) return null;
    pos += 3 + cbGrpprl;
  }

  // Đọc khối Pcdt (clxt === 0x02)
  if (pos >= clxEnd || tableStream[pos] !== 0x02 || pos + 5 > clxEnd) return null;
  const lcbPlcPcd = tableDv.getUint32(pos + 1, true);
  const plcPcdStart = pos + 5;
  if (lcbPlcPcd < 16 || plcPcdStart + lcbPlcPcd > clxEnd) return null;

  const pieceCount = Math.floor((lcbPlcPcd - 4) / 12);
  if (pieceCount <= 0) return null;

  const cp1252Decoder = new TextDecoder('windows-1252', { fatal: false });
  const utf16Decoder = new TextDecoder('utf-16le', { fatal: false });
  const parts: string[] = [];

  for (let i = 0; i < pieceCount; i++) {
    const cpStart = tableDv.getUint32(plcPcdStart + i * 4, true);
    const cpEnd = tableDv.getUint32(plcPcdStart + (i + 1) * 4, true);
    if (cpStart >= ccpText) break;
    if (cpEnd <= cpStart) continue;

    const takeChars = Math.min(cpEnd - cpStart, ccpText - cpStart);
    const pcdOffset = plcPcdStart + (pieceCount + 1) * 4 + i * 8;
    if (pcdOffset + 8 > plcPcdStart + lcbPlcPcd) break;

    const fcCompressed = tableDv.getUint32(pcdOffset + 2, true);
    const isCompressed = (fcCompressed & 0x40000000) !== 0;

    if (isCompressed) {
      const byteOffset = (fcCompressed & 0x3fffffff) >>> 1;
      if (byteOffset < wordDoc.length) {
        const endByte = Math.min(wordDoc.length, byteOffset + takeChars);
        parts.push(cp1252Decoder.decode(wordDoc.subarray(byteOffset, endByte)));
      }
    } else {
      const byteOffset = fcCompressed & 0x3fffffff;
      if (byteOffset < wordDoc.length) {
        const endByte = Math.min(wordDoc.length, byteOffset + takeChars * 2);
        parts.push(utf16Decoder.decode(wordDoc.subarray(byteOffset, endByte)));
      }
    }
  }

  if (parts.length === 0) return null;
  const cleaned = cleanBinaryDocText(parts.join(''));
  return cleaned.trim().length > 0 ? cleaned : null;
}

/**
 * Chuyển đổi tệp .doc nhị phân thành danh sách đoạn văn bản sạch kèm gợi ý định dạng.
 */
export function parseBinaryDocToParagraphItems(buffer: ArrayBuffer): BinaryDocParagraphItem[] {
  const extracted = extractTextFromBinaryDoc(buffer);
  if (!extracted) return [];

  const lines = extracted
    .split('\n')
    .map((l) => l.replace(/\s{2,}/g, ' ').trim())
    .filter((l) => l.length > 0 && !/^[-–—_\s]+$/.test(l));

  return lines.map((line) => {
    const isNarrativeCitation =
      NARRATIVE_CITATION_RE.test(line) ||
      /quy\s+định\s+như\s+sau\s*[:.]?\s*$/iu.test(line) ||
      /có\s+hiệu\s+lực\s+(?:thi\s+hành\s+)?kể\s+từ\s+ngày/iu.test(line);

    const isUpper = line === line.toUpperCase() && /\p{L}/u.test(line);
    const isHeadingPrefix =
      /^(LỜI\s+NÓI\s+ĐẦU|QUYẾT\s+ĐỊNH|PHẦN|CHƯƠNG|PHỤ\s+LỤC|MỤC|ĐIỀU|INTRODUCTION|PREFACE|PART|CHAPTER|APPENDIX|SECTION|ARTICLE|CONCLUSION)\b/iu.test(
        line
      );

    const isHeadingCandidate =
      !isNarrativeCitation && (isHeadingPrefix || (isUpper && line.length < 120));

    const isCentered =
      /^(?:CỘNG\s+HÒA\s+XÃ\s+HỘI|ĐỘC\s+LẬP\s*-\s*TỰ\s+DO|CHÍNH\s+PHỦ|QUỐC\s+HỘI|VĂN\s+PHÒNG\s+QUỐC\s+HỘI|LUẬT|BỘ\s+LUẬT|NGHỊ\s+ĐỊNH|CHƯƠNG\s+[IVXLCDM\d]+|PHỤ\s+LỤC(?:\s+[IVXLCDM\d]+)?)$/iu.test(
        line
      ) ||
      (isUpper && line.length < 80 && !line.includes('|'));

    return {
      text: line,
      isBold: isHeadingCandidate || isCentered,
      isCentered,
      isRight: false,
      isHeadingCandidate,
    };
  });
}
