var INV_ID = '18F4Zo3tNfgPGOq0tVPheNWKe8I56JiZ67X7gf7vhG6U';
var ORDER_ID = '1ibroQV42xuuvWg4P1kvaCw9RT_JxO9L-6lXVAgNjOhA';
var ORDER_TAB = '1) 발주_취합양식';
var DAYS = 7;   // 최근 며칠치만 출고 대상으로 볼지

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('다리마티 출고')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// 재고 + 향동 출고대상 읽기
function getData() {
  var invSS = SpreadsheetApp.openById(INV_ID);
  var cur = invSS.getSheetByName('현재재고').getDataRange().getValues();
  var stock = [];
  for (var i = 1; i < cur.length; i++) {
    if (cur[i][0]) stock.push({ code: cur[i][0], name: cur[i][1], opt: cur[i][2], hy: cur[i][3], nb: cur[i][4] });
  }
  // 불량품(2026-09-03 추가). 별도 보관이라 위 재고 숫자에는 안 들어간다.
  // 불량품 탭 오른쪽 집계표: H=상품코드, I=불량 합계(ARRAYFORMULA SUMIF).
  var defect = {};
  var dsh = invSS.getSheetByName('불량품');
  if (dsh) {
    var dv = dsh.getDataRange().getValues();
    for (var k = 1; k < dv.length; k++) {
      var dc = dv[k][7], dq = Number(dv[k][8]) || 0;
      if (dc) defect[dc] = dq;
    }
  }
  var ord = SpreadsheetApp.openById(ORDER_ID).getSheetByName(ORDER_TAB).getDataRange().getValues();
  var orders = [];
  var since = new Date(); since.setHours(0, 0, 0, 0); since.setDate(since.getDate() - DAYS);
  for (var r = 1; r < ord.length; r++) {
    var row = ord[r];
    var ship = String(row[3] || ''), stat = String(row[4] || '');
    if (ship.indexOf('한진') < 0) continue;        // 향동(직접출고)만
    if (stat.indexOf('출고') >= 0) continue;         // 이미 출고완료 제외 → 남은 게 '출고 대상'
    if (!row[8] && !row[9]) continue;                // 빈 행 skip
    var d = toDate_(row[0]);                         // 병합셀 탓에 옛 행이 미처리로 보임 → 날짜로 컷
    if (!d || d < since) continue;
    var tn = String(row[5] || '').trim();
    if (tn.indexOf('N배송') >= 0) continue;          // N배송 발송건 제외
    orders.push({
      rowIdx: r + 1,
      sig: orderSig_(row),
      date: fmtDate_(row[0]),
      recipient: String(row[6] || ''),
      color: String(row[8] || ''),
      size: String(row[9] || ''),
      comps: comps_(row),
      shoeCode: shoeCode_(row[8], row[9]),
      stat: stat.replace(/^\d\)\s*/, '')
    });
  }
  return {
    stock: stock,
    defect: defect,
    orders: orders,
    ts: Utilities.formatDate(new Date(), 'Asia/Seoul', 'MM/dd HH:mm')
  };
}

// 여러 사람이 동시에 눌러도 한 번에 하나씩만 쓰게 한다.
// (안 걸면 둘이 같은 줄을 '다음 빈 줄'로 계산해 서로 덮어쓴다)
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    throw new Error('다른 분이 저장 중이에요. 잠시 뒤 다시 눌러주세요.');
  }
  try { return fn(); } finally { lock.releaseLock(); }
}

// 출고완료 처리 → 발주시트 상태 변경 (기존 파서가 매시간 재고 차감)
// sig = 화면에 보여준 그 주문이 맞는지 확인하는 지문. 목록이 바뀌었으면 쓰지 않는다.
function markShipped(rowIdx, sig) {
  return withLock_(function () {
    var sh = SpreadsheetApp.openById(ORDER_ID).getSheetByName(ORDER_TAB);
    var row = sh.getRange(rowIdx, 1, 1, 10).getValues()[0];
    if (sig && orderSig_(row) !== sig) {
      throw new Error('그 사이 목록이 바뀌었어요. 새로고침 후 다시 눌러주세요.');
    }
    if (String(row[4] || '').indexOf('출고') >= 0) return 'already';  // 남이 먼저 처리함
    sh.getRange(rowIdx, 5).setValue('3) 출고 완료');
    return 'ok';
  });
}

// 운송장|받는사람|컬러|사이즈 — 줄이 밀리거나 바뀌면 달라진다
function orderSig_(row) {
  return [row[5], row[6], row[8], row[9]].map(function (v) { return String(v || '').trim(); }).join('|');
}

/* ───────── 양품화 입고 ───────── */
var RESTOCK_TAB = '양품화입고';   // 날짜 | 상품코드 | 수량 | 상품명(자동) | 메모

function getRestock() {
  var ss = SpreadsheetApp.openById(INV_ID);
  var cur = ss.getSheetByName('현재재고').getDataRange().getValues();
  var items = [];
  for (var i = 1; i < cur.length; i++) {
    if (cur[i][0]) items.push({ code: cur[i][0], name: cur[i][1], opt: cur[i][2], hy: Number(cur[i][3]) || 0 });
  }
  return { items: items, today: todayRows_(ss), ts: stamp_() };
}

// 양품화 입력 저장 → 양품화입고 탭에 append (현재재고 향동이 그만큼 +)
function addRestock(list) {
  var ss = SpreadsheetApp.openById(INV_ID);
  var sh = ss.getSheetByName(RESTOCK_TAB);
  if (!sh) throw new Error(RESTOCK_TAB + ' 탭을 찾을 수 없어요');

  var rows = [];
  for (var i = 0; i < list.length; i++) {
    var q = Number(list[i].qty) || 0;
    if (q > 0) rows.push([today_(), String(list[i].code), q]);
  }
  if (!rows.length) throw new Error('입력한 수량이 없어요');

  // 빈 줄 찾기 → 쓰기를 통째로 잠근다. 안 그러면 동시에 저장한 사람끼리 덮어쓴다.
  return withLock_(function () {
    var r = firstEmptyRow_(sh);
    // A~C 만 씀. D(상품명)는 시트 수식 자리라 건드리지 않음
    sh.getRange(r, 1, rows.length, 3).setValues(rows);
    sh.getRange(r, 1, rows.length, 1).setNumberFormat('yyyy-mm-dd');
    SpreadsheetApp.flush();
    return { added: rows.length, today: todayRows_(ss), stock: hyStock_(ss), ts: stamp_() };
  });
}

// 잘못 넣은 줄 되돌리기.
// 줄 번호만 믿으면 남이 먼저 지웠을 때 엉뚱한 줄이 지워진다 → 내용까지 확인하고 지운다.
function delRestock(rowIdx, code, qty) {
  var ss = SpreadsheetApp.openById(INV_ID);
  return withLock_(function () {
    var sh = ss.getSheetByName(RESTOCK_TAB);
    var target = rowIdx;
    if (code) {
      var v = sh.getRange(rowIdx, 2, 1, 2).getValues()[0];
      if (String(v[0]).trim() !== String(code) || Number(v[1]) !== Number(qty)) {
        // 줄이 밀렸다 → 오늘 넣은 것 중 같은 내용을 다시 찾는다
        target = 0;
        var today = todayRows_(ss);
        for (var i = 0; i < today.length; i++) {
          if (today[i].code === code && Number(today[i].qty) === Number(qty)) { target = today[i].row; break; }
        }
        if (!target) throw new Error('이미 지워졌거나 목록이 바뀌었어요. 새로고침해 주세요.');
      }
    }
    sh.deleteRow(target);
    SpreadsheetApp.flush();
    return { today: todayRows_(ss), stock: hyStock_(ss), ts: stamp_() };
  });
}

function todayRows_(ss) {
  var sh = ss.getSheetByName(RESTOCK_TAB);
  var v = sh.getDataRange().getValues();
  var t = Utilities.formatDate(today_(), 'Asia/Seoul', 'yyyy-MM-dd');
  var out = [];
  for (var i = 1; i < v.length; i++) {
    if (!v[i][1]) continue;
    var d = toDate_(v[i][0]);
    if (!d || Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd') !== t) continue;
    out.push({ row: i + 1, code: String(v[i][1]), qty: Number(v[i][2]) || 0 });
  }
  return out;
}

function hyStock_(ss) {
  var cur = ss.getSheetByName('현재재고').getDataRange().getValues();
  var m = {};
  for (var i = 1; i < cur.length; i++) if (cur[i][0]) m[cur[i][0]] = Number(cur[i][3]) || 0;
  return m;
}

function firstEmptyRow_(sh) {
  var v = sh.getRange(1, 2, sh.getMaxRows(), 1).getValues();   // B열(상품코드) 기준
  var last = 1;
  for (var i = 1; i < v.length; i++) if (String(v[i][0]).trim() !== '') last = i + 1;
  return last + 1;
}

function today_() {
  var n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}
function stamp_() { return Utilities.formatDate(new Date(), 'Asia/Seoul', 'MM/dd HH:mm'); }

function comps_(row) {
  var map = { 10: '신발', 11: '깔창', 12: '슈레이스', 14: '스티커', 15: '모자', 18: '타월', 19: '벨트', 20: '슈백' };
  var list = [];
  for (var c in map) { var q = Number(row[c]) || 0; if (q > 0) list.push(map[c] + (q > 1 ? '×' + q : '')); }
  return list.join(' · ');
}
function shoeCode_(c, z) {
  var x = /그레이|grey|oyster/i.test(c) ? 'GR' : /베이지|beige|sand/i.test(c) ? 'BG' : '?';
  var s = (String(z).match(/(\d{3})/) || [])[1] || '?';
  return x + '-' + s;
}
function toDate_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return v;
  var s = String(v || '').trim();
  if (!s) return null;
  var m = s.match(/(\d{1,2})[\/.-](\d{1,2})/);       // "8/6" 같은 문자열 대비
  if (!m) return null;
  return new Date(new Date().getFullYear(), Number(m[1]) - 1, Number(m[2]));
}
function fmtDate_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, 'Asia/Seoul', 'MM/dd');
  return String(v);
}

/* ═══════════════════════════════════════════════════════════════════════
   BR-001 Core Black 재고 — 쇼피파이에서 직접 읽는다 (2026-09-14 신설)

   왜 시트가 아니라 쇼피파이인가
     사전예약은 쇼피파이가 결제를 받고 **주문이 들어오는 순간 재고를 깎는다.**
     시트에 옮겨 적으면 두 곳이 생기고, 두 곳은 반드시 어긋난다.
     그래서 쇼피파이를 유일한 원본으로 두고 여기서는 보여주기만 한다.

   🪤 왜 Admin API 를 안 쓰나 — 열쇠(토큰)를 받을 수가 없다.
      Dev Dashboard 로 만드는 앱은 **서버가 있어야** 토큰을 받는다(설치하면
      토큰을 앱 주소로 보낸다). 우리는 서버가 없어서 2026-09-14 여기서 막혔다.
      → 대신 **우리 테마가 JSON 을 뱉는 페이지**를 하나 만들었다.
        테마 Liquid 는 재고 숫자를 그냥 알기 때문에 열쇠가 필요 없다.
        원본: darimati-theme/kr-work/templates/page.cb-stock-7f3a91.liquid

   🪤 주소는 아무 데도 링크하지 않는다. 핸들에 임의 문자열이 붙어 있는 이유다.
      재고 숫자가 손님에게 보일 이유가 없다.
   ═══════════════════════════════════════════════════════════════════════ */

var CB_FEED  = 'https://www.darimati.us/pages/cb-stock-7f3a91';
var CB_CACHE = 60;   // 초. 새로고침을 연타해도 쇼피파이를 때리지 않게

function getCoreBlack(fresh) {
  var cache = CacheService.getScriptCache();
  var hit = fresh ? null : cache.get('coreblack');
  if (hit) return cbDress_(JSON.parse(hit));

  var res = UrlFetchApp.fetch(CB_FEED, { muteHttpExceptions: true, followRedirects: true });
  var code = res.getResponseCode();
  if (code !== 200) {
    throw new Error('재고 창구가 ' + code + ' 를 돌려줬어요.\n' +
      '페이지가 지워졌거나 비공개일 수 있어요 — ' + CB_FEED);
  }

  var body;
  try { body = JSON.parse(res.getContentText()); }
  catch (e) {
    // 테마가 오류 화면(HTML)을 뱉은 경우다. 그대로 두면 무슨 일인지 모른다.
    throw new Error('재고 창구가 JSON 이 아닌 걸 돌려줬어요.\n' + res.getContentText().slice(0, 200));
  }
  if (!body.rows || !body.rows.length) throw new Error('재고 창구에 사이즈가 하나도 없어요.');

  var rows = [], tot = 0;
  body.rows.forEach(function (r) {
    var q = Number(r.available) || 0;
    tot += q;
    rows.push({ size: Number(r.size), available: q, sellable: !!r.sellable });
  });
  rows.sort(function (a, b) { return a.size - b.size; });

  var out = { product: body.product, rows: rows, shopTot: tot, feedTs: body.ts, ts: stamp_() };
  cache.put('coreblack', JSON.stringify(out), CB_CACHE);
  return cbDress_(out);
}

/* 쇼피파이에서 읽은 숫자에 **우리 수기 차감**을 입혀 진짜 재고를 만든다.
   🪤 이 부분은 캐시에 넣지 않는다. 수기로 하나 넣자마자 화면에 보여야 하는데
      캐시에 섞어두면 최대 60초 동안 옛 숫자가 남는다. */
function cbDress_(o) {
  var man = getCbManual();
  var tot = 0;
  o.rows = o.rows.map(function (r) {
    var cut = man.cut[r.size] || 0;
    var left = r.available - cut;
    tot += left;
    return { size: r.size, shop: r.available, cut: cut, left: left, sellable: r.sellable };
  });
  o.tot = tot;                 // 진짜 남은 수량
  o.cutTot = o.shopTot - tot;  // 수기로 빠진 합계
  o.log = man.rows;
  o.memo = getCbMemo();
  return o;
}


/* ── BR-001 블랙 메모장 ─────────────────────────────────────────────────
   왜 시트가 아니라 스크립트 속성인가: 메모 하나 때문에 시트에 탭을 새로
   만들면 그 탭을 누가 지우거나 줄을 밀면 깨진다. 속성은 그럴 일이 없다.
   ⚠️ 속성 하나는 9KB 까지. 메모로는 넉넉하다(한글 4천 자쯤).            */
var CB_MEMO_KEY = 'CB_MEMO';

function getCbMemo() {
  var raw = PropertiesService.getScriptProperties().getProperty(CB_MEMO_KEY);
  if (!raw) return { text: '', by: '', ts: '' };
  try { return JSON.parse(raw); } catch (e) { return { text: String(raw), by: '', ts: '' }; }
}

// 여러 사람이 동시에 저장해도 뒤엣것만 남게(덮어쓰기) — 메모는 한 덩어리라 이게 맞다
function saveCbMemo(text) {
  return withLock_(function () {
    var t = String(text == null ? '' : text);
    if (t.length > 8000) throw new Error('메모가 너무 길어요 (8000자까지)');
    var who = '';
    try { who = Session.getActiveUser().getEmail() || ''; } catch (e) {}
    var rec = { text: t, by: who, ts: stamp_() };
    PropertiesService.getScriptProperties().setProperty(CB_MEMO_KEY, JSON.stringify(rec));
    return rec;
  });
}


/* ═══════════════════════════════════════════════════════════════════════
   BR-001 블랙 — 수기 차감 (2026-09-14 신설)

   무엇을 하는 건가
     현대백화점 현장 신청처럼 **쇼피파이를 안 거치고 나가는 물량**을 여기 적는다.
     그러면 이 화면의 「남은 수량」에서 바로 빠진다.
     → 그래서 **진짜 재고는 이 대시보드**다. 쇼피파이는 온라인 판매분만 안다.

   🪤 두 번 빠지는 사고를 막는 장치
      사장님이 나중에 쇼피파이 관리자에서 그 수량을 직접 깎으실 수 있다.
      그때 이 줄이 그대로 남아 있으면 **같은 물량이 두 번 빠진다.**
      → 줄마다 「쇼피파이 반영함」을 누를 수 있게 했다. 누르면 F열에 날짜가
        박히고, 그 줄부터는 차감에 안 들어간다.

   🪤 로그는 속성이 아니라 시트에 쌓는다. 언젠가 수백 줄이 되고,
      사장님이 눈으로 훑거나 내보내야 할 수도 있기 때문이다.
      탭이 없으면 처음 쓸 때 자동으로 만든다.
   ═══════════════════════════════════════════════════════════════════════ */
var CB_LOG_TAB = 'CB수기차감';
var CB_LOG_HEAD = ['날짜', '사이즈', '수량', '메모', '적은사람', '쇼피파이 반영일'];

function cbLogSheet_() {
  var ss = SpreadsheetApp.openById(INV_ID);
  var sh = ss.getSheetByName(CB_LOG_TAB);
  if (!sh) {
    sh = ss.insertSheet(CB_LOG_TAB);
    sh.getRange(1, 1, 1, CB_LOG_HEAD.length).setValues([CB_LOG_HEAD]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.setColumnWidth(4, 320);
  }
  return sh;
}

// 로그를 읽어 사이즈별 차감량을 낸다. 반영일(F)이 찍힌 줄은 이미 쇼피파이가 알고 있으므로 뺀다.
function getCbManual() {
  var sh = cbLogSheet_();
  var v = sh.getDataRange().getValues();
  var rows = [], cut = {};
  for (var i = 1; i < v.length; i++) {
    var sz = Number(v[i][1]) || 0, q = Number(v[i][2]) || 0;
    if (!sz || !q) continue;
    var applied = !!v[i][5];
    if (!applied) cut[sz] = (cut[sz] || 0) + q;
    rows.push({
      row: i + 1, date: fmtDate_(v[i][0]), size: sz, qty: q,
      memo: String(v[i][3] || ''), by: String(v[i][4] || ''),
      applied: applied ? fmtDate_(v[i][5]) : ''
    });
  }
  rows.reverse();                       // 최근 것이 위로
  return { rows: rows, cut: cut };
}

function addCbManual(size, qty, memo) {
  var sz = Number(size) || 0, q = Number(qty) || 0;
  if (!sz) throw new Error('사이즈를 골라주세요');
  if (q <= 0) throw new Error('수량은 1 이상이어야 해요');
  var who = '';
  try { who = Session.getActiveUser().getEmail() || ''; } catch (e) {}
  return withLock_(function () {
    var sh = cbLogSheet_();
    var r = firstEmptyRow_(sh);
    sh.getRange(r, 1, 1, 5).setValues([[today_(), sz, q, String(memo || ''), who]]);
    sh.getRange(r, 1).setNumberFormat('yyyy-mm-dd');
    SpreadsheetApp.flush();
    return getCoreBlack(true);
  });
}

// 잘못 넣은 줄 지우기. 줄 번호만 믿으면 남이 먼저 지웠을 때 엉뚱한 줄이 날아간다.
function delCbManual(rowIdx, size, qty) {
  return withLock_(function () {
    var sh = cbLogSheet_();
    var v = sh.getRange(rowIdx, 2, 1, 2).getValues()[0];
    if (Number(v[0]) !== Number(size) || Number(v[1]) !== Number(qty)) {
      throw new Error('그 사이 목록이 바뀌었어요. 새로고침 후 다시 눌러주세요.');
    }
    sh.deleteRow(rowIdx);
    SpreadsheetApp.flush();
    return getCoreBlack(true);
  });
}

// 「쇼피파이에 반영함」 — 이 줄은 이제 차감에서 빠진다
function applyCbManual(rowIdx, size, qty) {
  return withLock_(function () {
    var sh = cbLogSheet_();
    var v = sh.getRange(rowIdx, 2, 1, 2).getValues()[0];
    if (Number(v[0]) !== Number(size) || Number(v[1]) !== Number(qty)) {
      throw new Error('그 사이 목록이 바뀌었어요. 새로고침 후 다시 눌러주세요.');
    }
    sh.getRange(rowIdx, 6).setValue(today_()).setNumberFormat('yyyy-mm-dd');
    SpreadsheetApp.flush();
    return getCoreBlack(true);
  });
}

/* ═══════════════════════════════════════════════════════════════════════
   현백 현장판매 (2026-09-14 신설)

   무엇인가: 현대백화점 팝업에서 **직접 건네고 끝난** 판매다.
   택배가 안 나가므로 기존 출고 화면에는 뜰 이유가 없고, 실제로 안 뜬다.
   그런데 재고는 분명히 빠졌으니 **얼마가 어디로 나갔는지는 봐야 한다.**

   🪤 기존 getData() 는 이 건을 절대 못 잡는다. 두 겹으로 막혀 있다.
        ① ship(D열)에 '한진'이 없으면 건너뛴다 — 현백은 '직접전달'
        ② stat(E열)에 '출고'가 있으면 건너뛴다 — 현백은 이미 '3) 출고 완료'
      그래서 그 필터를 손대지 않고 **함수를 따로 뺐다** (사장님 요구사항 4번).
      기존 택배 출고 로직은 한 글자도 안 건드렸다.

   🪤 병합셀 — 이 시트는 날짜(A)·판매처(B)가 여러 줄에 걸쳐 병합돼 있다.
      병합된 줄은 값이 **빈칸으로 읽힌다.** 그대로 두면 24건 중 첫 줄만 잡힌다.
      → 마지막으로 본 값을 이어서 쓴다(carry forward). 새 값이 나오면 갈아탄다.

   🪤 이어쓰기가 엉뚱한 줄까지 먹지 않도록 **사이즈(J)와 수량(AD)이 둘 다
      있는 줄만** 센다. 빈 줄·소계 줄은 자동으로 걸러진다.
   ═══════════════════════════════════════════════════════════════════════ */
var HY_SELLER = '현백';     // B열에 이 말이 들어간 행만

function getHyundai() {
  var ord = SpreadsheetApp.openById(ORDER_ID).getSheetByName(ORDER_TAB).getDataRange().getValues();

  var rows = [], bySize = {}, byColor = {}, tot = 0;
  var curDate = '', curSeller = '';

  for (var r = 1; r < ord.length; r++) {
    var row = ord[r];

    // 병합셀 이어쓰기 — 값이 있으면 갈아타고, 없으면 앞의 것을 그대로 쓴다
    if (String(row[0] || '').trim() || Object.prototype.toString.call(row[0]) === '[object Date]') curDate = row[0];
    if (String(row[1] || '').trim()) curSeller = String(row[1]).trim();

    if (curSeller.indexOf(HY_SELLER) < 0) continue;

    var size = String(row[9] || '').trim();
    var qty  = Number(row[29]) || 0;
    if (!size || qty <= 0) continue;          // 빈 줄·소계 줄 거르기

    var color = String(row[8] || '').trim();
    var mm = (size.match(/(\d{3})/) || [])[1] || '';
    var ck = /그레이|grey|oyster/i.test(color) ? '그레이'
           : /베이지|beige|sand/i.test(color) ? '베이지' : (color || '기타');

    if (mm) {
      bySize[mm] = bySize[mm] || { 그레이: 0, 베이지: 0, 기타: 0, 합: 0 };
      bySize[mm][ck === '그레이' || ck === '베이지' ? ck : '기타'] += qty;
      bySize[mm]['합'] += qty;
    }
    byColor[ck] = (byColor[ck] || 0) + qty;
    tot += qty;

    rows.push({
      row: r + 1,
      date: fmtDate_(curDate),
      who: String(row[6] || '').trim(),
      color: ck,
      size: mm ? mm + 'mm' : size,
      qty: qty,
      stat: String(row[4] || '').replace(/^\d\)\s*/, '')
    });
  }

  // 날짜 → 담당자 순으로 묶는다. 화면에서 「9/14 승민」 한 덩어리로 보여주기 위함.
  var groups = [], idx = {};
  rows.forEach(function (x) {
    var k = x.date + '|' + x.who;
    if (!idx[k]) { idx[k] = { date: x.date, who: x.who, qty: 0, items: [] }; groups.push(idx[k]); }
    idx[k].qty += x.qty;
    idx[k].items.push(x);
  });
  groups.reverse();   // 최근 것이 위로

  var sizes = Object.keys(bySize).sort(function (a, b) { return a - b; });
  return { rows: rows, groups: groups, sizes: sizes, bySize: bySize,
           byColor: byColor, tot: tot, cnt: rows.length, ts: stamp_() };
}
