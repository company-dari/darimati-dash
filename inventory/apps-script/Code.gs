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
