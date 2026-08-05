/**
 * 등록된 QR을 전부 파일로 뽑아 둔다 (PNG + SVG + 목록).
 *
 *   node ~/darimati-dash/qr/export.js
 *
 * 만들어지는 곳: ~/Desktop/다리마티-QR/
 *   F45합정_darimati-qr-f45-hapjeong.png   인쇄·화면용 (1200px 안팎)
 *   F45합정_darimati-qr-f45-hapjeong.svg   대형 인쇄용 (벡터라 안 깨짐)
 *   목록.txt                               어떤 QR이 어디로 가는지, 언제 만들었고 몇 번 찍혔는지
 *
 * 파일명 앞의 한글은 대시보드에 등록된 "이름"(공백 제거). 인쇄소에 넘길 때
 * 어느 지점 것인지 눈으로 바로 구분하려고 붙인다. 뒤의 코드는 추적용으로 남긴다.
 *
 * 대시보드와 똑같은 인코더(qrcode.js)를 쓰므로 화면에서 받는 파일과 결과가 같다.
 * 접속정보는 qr/api.txt 에서 읽는다. 중지된 QR도 기록으로 남기려고 함께 뽑는다.
 */
var fs = require('fs');
var path = require('path');
var zlib = require('zlib');

var HERE = __dirname;
var OUT = path.join(process.env.HOME, 'Desktop', '다리마티-QR');
var BASE = 'https://company-dari.github.io/darimati-dash/q/?code=';
var PAD = 4;          // QR 둘레 흰 여백(모듈) — 자르면 인식률이 떨어진다
var TARGET_PX = 1200; // PNG 목표 크기

eval(fs.readFileSync(path.join(HERE, 'qrcode.js'), 'utf8'));

/* ── 접속정보 ─────────────────────────────────────── */

function creds() {
  var lines;
  try {
    lines = fs.readFileSync(path.join(HERE, 'api.txt'), 'utf8')
      .split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
  } catch (e) {
    return null;
  }
  return lines.length >= 2 ? { api: lines[0], key: lines[1] } : null;
}

/* ── QR ───────────────────────────────────────────── */

function matrix(url) {
  var q = qrcode(0, 'M');
  q.addData(url);
  q.make();
  var n = q.getModuleCount(), rows = [];
  for (var r = 0; r < n; r++) {
    var row = [];
    for (var c = 0; c < n; c++) row.push(q.isDark(r, c) ? 1 : 0);
    rows.push(row);
  }
  return rows;
}

function svg(rows) {
  var n = rows.length, s = n + PAD * 2, d = [];
  for (var r = 0; r < n; r++)
    for (var c = 0; c < n; c++)
      if (rows[r][c]) d.push('M' + (c + PAD) + ' ' + (r + PAD) + 'h1v1h-1z');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + s + ' ' + s +
         '" width="1200" height="1200" shape-rendering="crispEdges">' +
         '<rect width="' + s + '" height="' + s + '" fill="#fff"/>' +
         '<path d="' + d.join('') + '" fill="#000"/></svg>';
}

/* PNG를 직접 쓴다 — 외부 라이브러리 없이 돌게 하려고.
   회색조 8비트. 흰 여백을 포함해 한 장으로 만든다. */
var CRC = (function () {
  var t = [];
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  var c = 0xFFFFFFFF;
  for (var i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  var len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  var body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  var crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function png(rows) {
  var n = rows.length;
  var px = Math.max(4, Math.round(TARGET_PX / (n + PAD * 2)));
  var size = (n + PAD * 2) * px;

  var raw = Buffer.alloc((size + 1) * size, 0xFF);
  for (var y = 0; y < size; y++) {
    raw[y * (size + 1)] = 0;                       // 필터 없음
    var mr = Math.floor(y / px) - PAD;
    if (mr < 0 || mr >= n) continue;
    for (var x = 0; x < size; x++) {
      var mc = Math.floor(x / px) - PAD;
      if (mc >= 0 && mc < n && rows[mr][mc]) raw[y * (size + 1) + 1 + x] = 0x00;
    }
  }

  var ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // 비트 깊이
  ihdr[9] = 0;   // 회색조
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ── 실행 ─────────────────────────────────────────── */

function pad(s, w) {
  s = String(s == null ? '' : s);
  var len = 0;
  for (var i = 0; i < s.length; i++) len += s.charCodeAt(i) > 0x7F ? 2 : 1;
  return s + new Array(Math.max(1, w - len + 1)).join(' ');
}

(async function () {
  var c = creds();
  if (!c) {
    console.error('qr/api.txt 가 없습니다. 1행에 …/exec 주소, 2행에 암호를 넣어 주세요.');
    process.exit(1);
  }

  var sep = c.api.indexOf('?') > -1 ? '&' : '?';
  var res = await fetch(c.api + sep + 'a=list&key=' + encodeURIComponent(c.key));
  var data = await res.json();
  if (!data.ok) {
    console.error('구글이 거절했습니다: ' + data.error);
    process.exit(1);
  }
  if (!data.links.length) {
    console.log('등록된 QR이 없습니다.');
    return;
  }

  fs.mkdirSync(OUT, { recursive: true });

  /* 옛 이름으로 뽑아둔 파일이 남아 헷갈리는 걸 막는다(같은 QR이 두 벌 보임). */
  fs.readdirSync(OUT).forEach(function (f) {
    if (/darimati-qr-.+\.(png|svg)$/.test(f)) fs.unlinkSync(path.join(OUT, f));
  });

  var list = [
    '다리마티 QR 기록',
    '뽑은 시각: ' + new Date().toLocaleString('ko-KR'),
    '',
    '인쇄된 QR은 아래 "고정 주소"만 갖고 있습니다.',
    '목적지가 바뀌어도 QR은 다시 만들 필요가 없습니다.',
    '',
    pad('코드', 16) + pad('이름', 22) + pad('스캔', 8) + pad('만든날', 13) + '목적지',
    new Array(110).join('─')
  ];

  data.links.forEach(function (x) {
    var url = BASE + x.code;
    var rows = matrix(url);
    /* 파일명 앞머리 = 등록된 이름. 공백과 파일명에 못 쓰는 글자만 걷어낸다. */
    var head = String(x.name || '').replace(/[\/\\:*?"<>|]/g, '').replace(/\s+/g, '');
    var stem = (head ? head + '_' : '') + 'darimati-qr-' + x.code;
    fs.writeFileSync(path.join(OUT, stem + '.svg'), svg(rows));
    fs.writeFileSync(path.join(OUT, stem + '.png'), png(rows));

    list.push(
      pad(x.code, 16) + pad(x.name, 22) + pad(x.scans + '회', 8) +
      pad(x.created, 13) + x.url + (x.active ? '' : '   [중지됨]')
    );
    list.push(pad('', 16) + '고정 주소: ' + url);
    if (x.memo) list.push(pad('', 16) + '메모: ' + x.memo);
    list.push('');

    console.log('  ' + pad(x.code, 14) + '버전' + ((rows.length - 17) / 4) +
                ' · PNG+SVG 저장' + (x.active ? '' : ' (중지됨)'));
  });

  fs.writeFileSync(path.join(OUT, '목록.txt'), list.join('\n') + '\n');
  console.log('\nQR ' + data.links.length + '개 → ' + OUT);
})();
