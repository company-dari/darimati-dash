/**
 * 다리마티 QR 만들기 — SVG(벡터) + PNG(비트맵)
 * ─────────────────────────────────────────────────────────────
 * 왜 직접 만드나
 *   외부 QR 사이트를 쓰면 그 사이트가 없어질 때 QR 도 같이 죽는다.
 *   저장소 안의 qrcode.js 만으로 만든다. 설치할 것 없다.
 *
 * 쓰는 법
 *   node make-qr.mjs "<주소>" "<나올 파일 이름(확장자 없이)>" [출력 폴더]
 *
 * 규칙 (인쇄물이라 되돌릴 수 없다)
 *   · 오류복원 H — 30% 가 가려져도 읽힌다. 폼보드가 긁히거나 젖어도 산다
 *   · 여백(quiet zone) 4모듈 — 이걸 빼면 스캐너가 테두리를 못 찾는다. 줄이지 말 것
 *   · QR 에는 목적지를 넣지 않는다. /q/?code=… 고정 주소만 넣는다
 *     목적지가 바뀌어도 인쇄물을 다시 찍지 않기 위해서다 (docs/현대백화점팝업-QR-평가보고서.md)
 */
import { createRequire } from 'module';
import { deflateSync } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const require = createRequire(import.meta.url);
const QRCode = require('./qrcode.js');

const INK   = '#23201E';   // 다리마티 먹색
const PAPER = '#FFFFFF';   // 인쇄는 흰 바탕이 가장 잘 읽힌다
const QUIET = 4;           // 여백(모듈 수) — 규격 최소값
const PNG_PX = 1200;       // PNG 한 변

const [, , url, name, outDir = '.'] = process.argv;
if (!url || !name) {
  console.error('사용법: node make-qr.mjs "<주소>" "<파일이름>" [폴더]');
  process.exit(1);
}

const qr = QRCode(0, 'H');
qr.addData(url);
qr.make();
const n = qr.getModuleCount();
const side = n + QUIET * 2;

// ── SVG (벡터 — 인쇄용. 아무리 키워도 안 깨진다) ──────────────
let path = '';
for (let r = 0; r < n; r++) {
  for (let c = 0; c < n; c++) {
    if (qr.isDark(r, c)) path += `M${c + QUIET} ${r + QUIET}h1v1h-1z`;
  }
}
const svg =
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" width="${side * 8}" height="${side * 8}" shape-rendering="crispEdges">
  <title>다리마티 — ${url}</title>
  <rect width="${side}" height="${side}" fill="${PAPER}"/>
  <path d="${path}" fill="${INK}"/>
</svg>
`;

// ── PNG (비트맵 — 화면·카톡·인스타용) ────────────────────────
function png(width, pixels /* Uint8Array RGB */) {
  const crcTable = (() => {
    const t = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    return t;
  })();
  const crc = buf => {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, cr]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(width, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;  // 8bit RGB
  const raw = Buffer.alloc((width * 3 + 1) * width);
  for (let y = 0; y < width; y++) {
    raw[y * (width * 3 + 1)] = 0;                                       // 필터 없음
    pixels.copy ? null : null;
    Buffer.from(pixels.buffer, y * width * 3, width * 3)
      .copy(raw, y * (width * 3 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const [ir, ig, ib] = hex(INK);
const [pr, pg, pb] = hex(PAPER);
const scale = Math.floor(PNG_PX / side);
const W = side * scale;                       // 모듈이 정수 픽셀로 떨어지게 (흐려짐 방지)
const px = new Uint8Array(W * W * 3);
for (let y = 0; y < W; y++) {
  const r = Math.floor(y / scale) - QUIET;
  for (let x = 0; x < W; x++) {
    const c = Math.floor(x / scale) - QUIET;
    const dark = r >= 0 && c >= 0 && r < n && c < n && qr.isDark(r, c);
    const o = (y * W + x) * 3;
    px[o] = dark ? ir : pr; px[o + 1] = dark ? ig : pg; px[o + 2] = dark ? ib : pb;
  }
}

mkdirSync(outDir, { recursive: true });
const svgPath = join(outDir, `${name}.svg`);
const pngPath = join(outDir, `${name}.png`);
writeFileSync(svgPath, svg, 'utf8');
writeFileSync(pngPath, png(W, px));

console.log(`주소   ${url}`);
console.log(`모듈   ${n}x${n}  (여백 ${QUIET}, 오류복원 H)`);
console.log(`SVG    ${svgPath}`);
console.log(`PNG    ${pngPath}  ${W}x${W}px (1모듈 = ${scale}px)`);
