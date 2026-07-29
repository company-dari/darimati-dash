/**
 * 다리마티 QR · 링크표 + 스캔 기록 엔진 (Google Apps Script)
 * ────────────────────────────────────────────────────────
 * 인쇄된 QR은 "고정 주소"만 갖고 있고, 그 주소가 어디로 갈지는 이 시트가 정한다.
 * 즉 목적지를 바꾸고 싶으면 시트(또는 QR 대시보드)에서 한 줄만 고치면 되고,
 * 이미 뿌린 전단지·명함·현수막은 손댈 필요가 없다.
 *
 * 시트 두 장을 자동으로 만든다.
 *   링크 : 코드 | 이름 | 목적지 | 메모 | 생성일 | 상태
 *   스캔 : 시각 | 코드 | 기기 | 유입
 *
 * 손님이 QR을 찍을 때 부르는 go 요청에는 암호가 필요 없다(필요하면 QR이 안 열림).
 * 목적지를 고치거나 목록을 읽는 요청만 아래 KEY를 알아야 통과한다.
 *
 * ⚠️ 코드를 넘기는 파라미터 이름은 반드시 `code` 다. `c` 를 쓰면 안 된다 —
 *    구글 프런트가 script.google.com 요청의 `c=글자` 를 400으로 막아버린다
 *    (`c=1` 같은 숫자만 통과). 2026-07-30에 실제로 걸려서 이름을 바꿨다.
 */

// QR 대시보드에서 처음 한 번 입력할 암호. 바꾸고 싶으면 이 줄만 고치세요.
var KEY = 'dari1!';

// 코드가 없거나 중지된 QR을 찍었을 때 손님이 착지할 곳. 빈손으로 돌려보내지 않는다.
var FALLBACK = 'https://www.darimati.us';

var LINK_SHEET = '링크';
var LOG_SHEET = '스캔';
var LINK_HEADERS = ['코드', '이름', '목적지', '메모', '생성일', '상태'];
var LOG_HEADERS = ['시각', '코드', '기기', '유입'];
var TZ = 'Asia/Seoul';

/* ── 진입점 ───────────────────────────────────────── */

function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = p.a || 'go';
  try {
    // 손님용 — 암호 없이 통과. 이 한 줄이 막히면 인쇄물이 죽는다.
    if (action === 'go') return out(go_(p));

    if (!auth_(p)) return out({ ok: false, error: 'BAD_KEY' });

    if (action === 'list') return out(list_());
    if (action === 'save') return out(locked_(function () { return save_(p); }));
    if (action === 'del') return out(locked_(function () { return del_(p); }));
    if (action === 'ping') return out({ ok: true, pong: true });

    return out({ ok: false, error: 'UNKNOWN_ACTION' });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  return doGet(e);
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function auth_(p) {
  return String(p.key || '') === KEY;
}

function locked_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/* ── 시트 준비 ────────────────────────────────────── */

function sheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function links_() { return sheet_(LINK_SHEET, LINK_HEADERS); }
function logs_() { return sheet_(LOG_SHEET, LOG_HEADERS); }

function code_(v) {
  return String(v || '').trim().toLowerCase();
}

/* ── 손님이 QR을 찍었을 때 ────────────────────────── */

function go_(p) {
  var c = code_(p.code);
  if (!c) return { ok: false, error: 'NO_CODE', url: FALLBACK };

  var sh = links_();
  var n = sh.getLastRow() - 1;
  var rows = n > 0 ? sh.getRange(2, 1, n, LINK_HEADERS.length).getValues() : [];

  for (var i = 0; i < rows.length; i++) {
    if (code_(rows[i][0]) !== c) continue;

    var url = String(rows[i][2] || '').trim();
    var paused = String(rows[i][5] || '').trim() === '중지';
    if (paused || !url) {
      return { ok: false, error: paused ? 'PAUSED' : 'NO_TARGET', url: FALLBACK };
    }

    // 기록은 남기되, 실패해도 손님 이동은 절대 막지 않는다.
    try { logScan_(c, p); } catch (err) {}
    return { ok: true, url: url, name: String(rows[i][1] || '') };
  }

  return { ok: false, error: 'NOT_FOUND', url: FALLBACK };
}

function logScan_(c, p) {
  logs_().appendRow([new Date(), c, String(p.d || ''), String(p.r || '')]);
}

/* ── 대시보드용 ───────────────────────────────────── */

function list_() {
  var sh = links_();
  var n = sh.getLastRow() - 1;
  var rows = n > 0 ? sh.getRange(2, 1, n, LINK_HEADERS.length).getValues() : [];

  var stat = scanStats_();
  var items = rows
    .filter(function (r) { return code_(r[0]); })
    .map(function (r) {
      var c = code_(r[0]);
      var s = stat.by[c] || { total: 0, last: '', days: {} };
      return {
        code: c,
        name: String(r[1] || ''),
        url: String(r[2] || '').trim(),
        memo: String(r[3] || ''),
        created: fmt_(r[4]),
        active: String(r[5] || '').trim() !== '중지',
        scans: s.total,
        last: s.last,
        days: s.days
      };
    });

  return { ok: true, links: items, dates: stat.dates, total: stat.total };
}

// 최근 30일치만 날짜별로 쪼갠다. 총합과 마지막 스캔은 전체 기간 기준.
function scanStats_() {
  var sh = logs_();
  var n = sh.getLastRow() - 1;
  var by = {}, total = 0;

  var dates = [];
  var today = new Date();
  for (var d = 29; d >= 0; d--) {
    var t = new Date(today.getTime() - d * 86400000);
    dates.push(Utilities.formatDate(t, TZ, 'yyyy-MM-dd'));
  }
  var window = {};
  dates.forEach(function (k) { window[k] = true; });

  if (n > 0) {
    var rows = sh.getRange(2, 1, n, 2).getValues();
    for (var i = 0; i < rows.length; i++) {
      var c = code_(rows[i][1]);
      if (!c) continue;
      var when = rows[i][0];
      var key = when instanceof Date ? Utilities.formatDate(when, TZ, 'yyyy-MM-dd') : '';

      if (!by[c]) by[c] = { total: 0, last: '', days: {} };
      by[c].total++;
      total++;
      if (key && key > by[c].last) by[c].last = key;
      if (key && window[key]) by[c].days[key] = (by[c].days[key] || 0) + 1;
    }
  }

  return { by: by, total: total, dates: dates };
}

function save_(p) {
  var c = code_(p.code);
  if (!c) return { ok: false, error: 'NO_CODE' };
  if (!/^[a-z0-9][a-z0-9-]*$/.test(c)) return { ok: false, error: 'BAD_CODE' };

  var url = String(p.url || '').trim();
  if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;

  var sh = links_();
  var n = sh.getLastRow() - 1;
  var rows = n > 0 ? sh.getRange(2, 1, n, LINK_HEADERS.length).getValues() : [];

  for (var i = 0; i < rows.length; i++) {
    if (code_(rows[i][0]) !== c) continue;
    var row = i + 2;
    sh.getRange(row, 2).setValue(String(p.name || rows[i][1] || ''));
    if (url) sh.getRange(row, 3).setValue(url);
    sh.getRange(row, 4).setValue(String(p.memo != null ? p.memo : rows[i][3] || ''));
    sh.getRange(row, 6).setValue(String(p.active) === '0' ? '중지' : '활성');
    return { ok: true, updated: true, code: c };
  }

  if (!url) return { ok: false, error: 'NO_TARGET' };
  sh.appendRow([
    c,
    String(p.name || ''),
    url,
    String(p.memo || ''),
    Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'),
    String(p.active) === '0' ? '중지' : '활성'
  ]);
  return { ok: true, created: true, code: c };
}

// 링크 줄만 지운다. 스캔 기록은 남겨 둔다(지난 성과까지 사라지면 곤란하므로).
function del_(p) {
  var c = code_(p.code);
  var sh = links_();
  var n = sh.getLastRow() - 1;
  var rows = n > 0 ? sh.getRange(2, 1, n, 1).getValues() : [];
  for (var i = 0; i < rows.length; i++) {
    if (code_(rows[i][0]) === c) {
      sh.deleteRow(i + 2);
      return { ok: true, deleted: c };
    }
  }
  return { ok: false, error: 'NOT_FOUND' };
}

function fmt_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return String(v || '');
}
