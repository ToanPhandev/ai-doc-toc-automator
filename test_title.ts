import { formatDisplayTitle, formatSmartBaseName, ensureDocumentTypePrefix } from './src/utils/headingParser.ts';

const baseName = '43e8904e-5a80-484e-a37a-de2d34440716';
const rawTitle = 'QUY ĐỊNH CHI TIẾT THI HÀNH MỘT SỐ ĐIỀU CỦA LUẬT CHỨNG KHOÁN';
const fileName = '43e8904e-5a80-484e-a37a-de2d34440716.pdf';

const chosenTitle = ensureDocumentTypePrefix(rawTitle, fileName);
console.log('chosenTitle:', chosenTitle);

const smartBase = formatSmartBaseName(baseName, chosenTitle);
console.log('smartBaseName:', smartBase);

const displayTitle = formatDisplayTitle(smartBase);
console.log('displayTitle:', displayTitle);
