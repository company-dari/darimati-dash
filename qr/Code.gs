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

/* ── 진입점 ───────────────────────────────────────── */

function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = p.a || 'go';
  try {
    // 손님용 — 암호 없이 통과. 이 한 줄이 막히면 인쇄물이 죽는다.
    if (action === 'go') return out(go_(p));

    if (!auth_(p)) return out({ ok: false, error: 'BAD_KEY' });

    if (action === 'list') return out(list_(p));
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

/* 시트에서 읽은 값을 날짜로 바꾼다.
   `v instanceof Date` 는 여기서 믿을 수 없다 — 실제로 시트가 돌려준 날짜값이
   instanceof 를 통과하지 못해 최근 스캔·30일 그래프가 통째로 비었다(2026-07-30).
   그래서 "getTime 을 가진 물건이면 날짜"로 취급한다. */
function asDate_(v) {
  if (v && typeof v.getTime === 'function') return v;
  if (v) {
    var d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

/* 날짜를 yyyy-MM-dd 로 만든다.
   ⚠️ Utilities.formatDate 를 쓰지 않는다 — 앱스스크립트에서 이 호출은 서비스 경계를 넘어가
   하나에 수십 ms 씩 먹는다. 목록 조회가 30번 넘게 부르며 3초를 잡아먹고 있었다(2026-07-30).
   한국시간은 UTC+9 로 고정(서머타임 없음)이라 UTC 게터로 정확히 계산할 수 있고,
   스크립트 시간대 설정과 무관하게 같은 값이 나온다. */
function ymd_(v) {
  var d = asDate_(v);
  if (!d) return '';
  var k = new Date(d.getTime() + 9 * 3600 * 1000);
  var m = k.getUTCMonth() + 1, day = k.getUTCDate();
  return k.getUTCFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
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

function list_(p) {
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

  var res = { ok: true, links: items, dates: stat.dates, total: stat.total };

  /* 시트 주소는 요청받을 때만 넘긴다 — getUrl() 도 느린 호출이라
     대시보드가 이미 갖고 있으면 부르지 않는다. */
  if (p && String(p.sheet) === '1') {
    res.sheet = SpreadsheetApp.getActiveSpreadsheet().getUrl();
  }
  return res;
}

// 최근 30일치만 날짜별로 쪼갠다. 총합과 마지막 스캔은 전체 기간 기준.
function scanStats_() {
  var sh = logs_();
  var n = sh.getLastRow() - 1;
  var by = {}, total = 0;

  var dates = [];
  var today = new Date();
  for (var d = 29; d >= 0; d--) {
    dates.push(ymd_(new Date(today.getTime() - d * 86400000)));
  }
  var window = {};
  dates.forEach(function (k) { window[k] = true; });

  if (n > 0) {
    var rows = sh.getRange(2, 1, n, 2).getValues();
    for (var i = 0; i < rows.length; i++) {
      var c = code_(rows[i][1]);
      if (!c) continue;
      var key = ymd_(rows[i][0]);

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
    ymd_(new Date()),
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
  return ymd_(v) || String(v || '');
}
