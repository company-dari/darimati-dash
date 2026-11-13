// 홈 A~Z 점검 (2026-11-13 홈 v7 라이브) — 깃허브 서버의 진짜 크롬으로
// ① 11개 언어 홈: 번역 빠짐·언어·사진 깨짐·영상·가로 넘침(1440·390)·픽셀 개수
// ② 홈의 모든 링크를 실제로 열어 상태 확인(우리 주소는 1.5초 간격) + 언어별 링크 앞부분(/ja/…) 확인
// ③ 측정: PageView·DeepView(50% 스크롤)·상품 칸 클릭 이벤트가 메타로 나가는지(facebook.com/tr 요청 가로채기)
// ④ 캡처: 한국어 1440·390 조각 → artifact
// 사용: node tools/home-audit.mjs [기본주소=https://www.darimati.us] [미리보기 테마 ID]
import { chromium } from 'playwright';
import fs from 'fs';
const BASE = process.argv[2] || 'https://www.darimati.us';
const PREVIEW = process.argv[3] ? `preview_theme_id=${process.argv[3]}` : '';
const LANGS = ['', '/en', '/ja', '/de', '/fr', '/es', '/it', '/nl', '/pt', '/fi', '/th'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const q = p => p + (PREVIEW ? (p.includes('?') ? '&' : '?') + PREVIEW : '');
fs.mkdirSync('shots', { recursive: true });
const b = await chromium.launch();
const ctx = await b.newContext({ locale: 'ko-KR' });
const rows = []; let koLinks = []; const problems = [];

async function scrollAll(p) {
  let H = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += 500) { await p.evaluate(y => scrollTo(0, y), y); await p.waitForTimeout(150); H = await p.evaluate(() => document.documentElement.scrollHeight); }
  await p.waitForTimeout(1500);
}

for (const L of LANGS) {
  const p = await ctx.newPage(); await p.setViewportSize({ width: 1440, height: 900 });
  const ev = []; p.on('request', r => { const u = r.url(); if (u.includes('facebook.com/tr')) { const m = u.match(/[?&]ev=([^&]+)/); if (m) ev.push(decodeURIComponent(m[1])); } });
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  await p.addInitScript(() => { window.__ev = []; let real; Object.defineProperty(window, 'fbq', { configurable: true, get() { return real; }, set(f) { const w = function () { try { window.__ev.push(arguments[0] + ':' + arguments[1]); } catch (e) {} return f.apply(this, arguments); }; Object.assign(w, f); w.getState = f.getState; real = w; } }); });
  let hdrOv = null;
  const res = await p.goto(BASE + q(L + '/'), { waitUntil: 'load' }); await p.waitForTimeout(2500);
  if (L === '') {
    await p.screenshot({ path: 'shots/first-1440x900.jpg', type: 'jpeg', quality: 70 });
    const logo = p.locator('.header-logo__image-container--original').first();
    if (await logo.count()) { await logo.hover(); await p.waitForTimeout(900); await p.screenshot({ path: 'shots/header-hover.jpg', type: 'jpeg', quality: 80, clip: { x: 0, y: 0, width: 720, height: 110 } }); await p.mouse.move(700, 600); }
    await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(1200);
    await p.screenshot({ path: 'shots/first-390x844.jpg', type: 'jpeg', quality: 70 });
    // 폰 헤더: 미리보기 알약 숨기고 360·390 캡처 + 로고와 다른 칸 겹침(px) 측정
    hdrOv = {};
    for (const w of [360, 390]) {
      await p.setViewportSize({ width: w, height: 844 }); await p.waitForTimeout(900);
      hdrOv[w] = await p.evaluate(() => {
        document.querySelectorAll('body *').forEach(e => { if (getComputedStyle(e).position === 'fixed' && /미리보기 화면/.test(e.textContent || '') && e.textContent.length < 80) e.style.display = 'none'; });
        const logo = document.querySelector('.header-logo__image-container--original'); if (!logo) return 'no logo';
        const L = logo.getBoundingClientRect(); const hdr = logo.closest('header, #header-component') || document.body;
        let worst = 0, who = '';
        hdr.querySelectorAll('a, button, [role=button]').forEach(el => { if (logo.contains(el) || el.contains(logo)) return; const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
          const ox = Math.min(L.right, r.right) - Math.max(L.left, r.left), oy = Math.min(L.bottom, r.bottom) - Math.max(L.top, r.top);
          if (ox > 0 && oy > 0 && ox > worst) { worst = Math.round(ox); who = (el.getAttribute('aria-label') || el.className || el.tagName).toString().slice(0, 40); } });
        return { logo: [Math.round(L.left), Math.round(L.right)], overlap_px: worst, with: who };
      });
      await p.screenshot({ path: `shots/header-${w}.jpg`, type: 'jpeg', quality: 85, clip: { x: 0, y: 0, width: w, height: 70 } });
    }
    await p.setViewportSize({ width: 1440, height: 900 }); await p.waitForTimeout(800);
  }
  await scrollAll(p);
  const info = await p.evaluate(() => {
    const root = document.querySelector('.dm-h7');
    const txt = root ? root.innerText : '';
    return {
      lang: document.documentElement.lang, has: !!root,
      missing: (document.body.innerHTML.match(/translation missing[^<"]{0,60}/g) || []).slice(0, 5),
      intro: (document.querySelector('.dm-h7 .dm-intro') || {}).innerText?.slice(0, 40),
      hangul: root ? (txt.match(/[가-힣]/g) || []).length : -1,
      imgs: root ? root.querySelectorAll('img').length : 0,
      broken: root ? [...root.querySelectorAll('img')].filter(i => i.complete && i.naturalWidth === 0).map(i => i.src.split('/').pop().slice(0, 40)) : [],
      videos: root ? root.querySelectorAll('video').length : 0,
      ox: document.documentElement.scrollWidth - innerWidth,
      pixels: window.fbq && fbq.getState ? fbq.getState().pixels.map(x => x.id) : null,
      prices: root ? [...root.querySelectorAll('#lineup a[data-dm-at="home7-lineup"]')].map(a => a.innerText.replace(/\s+/g, ' ').trim().slice(0, 80)) : [],
      links: root ? [...new Set([...root.querySelectorAll('a[href]')].map(a => a.getAttribute('href')))] : [],
      form: !!document.querySelector('.dm-h7 form[action*="/contact"][data-dm="lead"] input[name="contact[email]"]'),
    };
  });
  info.header_overlap = hdrOv;
  // 폰 390 넘침
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(1200);
  const ox390 = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  if (L === '') {
    // 11/14 영상이 자리만 차지하고 안 보이는 고장 감지: 홈 안 모든 video 의 크기·보임·조상 중 가리는 것
    info.videos = await p.evaluate(async () => { const out = []; for (const v of document.querySelectorAll('.dm-h7 video')) {
      v.scrollIntoView({ block: 'center' }); await new Promise(r => setTimeout(r, 300));
      const r = v.getBoundingClientRect(), cs = getComputedStyle(v);
      let hid = null; for (let e = v; e && e !== document.body; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.05 || s.clipPath !== 'none' || s.contentVisibility === 'hidden') { hid = (e.tagName + '.' + (e.className || '') + ' ' + [s.display, s.visibility, s.opacity, s.clipPath].join('|')).slice(0, 120); break; } }
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      out.push({ label: (v.getAttribute('aria-label') || '').slice(0, 30), w: Math.round(r.width), h: Math.round(r.height), bg: cs.backgroundColor, hid, ready: v.readyState, err: v.error && v.error.code, top: top === v ? 'self' : (top ? (top.tagName + '.' + (top.className && top.className.baseVal !== undefined ? top.className.baseVal : top.className) + ' ' + (top.getAttribute('style') || '').slice(0, 90)) : null) });
    } return out; });
    for (const v of info.videos) if (v.w < 20 || v.h < 20 || v.hid || (v.top && v.top !== 'self' && !/SPAN|svg|path|DIV.dm-swipe/.test(v.top))) problems.push('영상 안 보임 ' + JSON.stringify(v));
    // 캡처(한국어) 390 → 1440
    const H = await p.evaluate(() => document.documentElement.scrollHeight);
    for (let i = 0, y = 0; y < H && i < 6; i++, y += 2400) await p.screenshot({ path: `shots/ko-390-${i}.jpg`, type: 'jpeg', quality: 60, fullPage: true, clip: { x: 0, y, width: 390, height: Math.min(2400, H - y) } });
    await p.setViewportSize({ width: 1440, height: 900 }); await p.waitForTimeout(1200);
    const H2 = await p.evaluate(() => document.documentElement.scrollHeight);
    for (let i = 0, y = 0; y < H2 && i < 7; i++, y += 2400) await p.screenshot({ path: `shots/ko-1440-${i}.jpg`, type: 'jpeg', quality: 55, fullPage: true, clip: { x: 0, y, width: 1440, height: Math.min(2400, H2 - y) } });
    koLinks = info.links;
    // 측정: 위로 → 50% 스크롤(DeepView) → 상품 칸 클릭
    await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(800);
    await p.evaluate(() => scrollTo(0, document.documentElement.scrollHeight * 0.6)); await p.waitForTimeout(2500);
    info.fbq_after_scroll = await p.evaluate(() => window.__ev.slice());
    const card = p.locator('#lineup a[data-dm-at="home7-lineup"]').nth(2);
    await card.scrollIntoViewIfNeeded();
    await p.evaluate(() => window.addEventListener('click', e => { window.__href = e.target.closest('a')?.getAttribute('href'); e.preventDefault(); }, { once: true }));
    await card.click(); await p.waitForTimeout(1500);
    info.fbq_after_click = await p.evaluate(() => window.__ev.slice());
    info.clicked_href = await p.evaluate(() => window.__href);
  }
  info.events = [...new Set(ev)]; info.fbq_calls = await p.evaluate(() => (window.__ev || []).slice()).catch(() => null);
  rows.push({ L: L || '/(ko)', status: res.status(), ox390, errs: errs.slice(0, 3), ...info });
  await p.close(); await sleep(1500);
}

// ② 링크 열어 보기 (한국어 링크 전부 + 다른 언어는 앞부분만 확인)
const linkRes = [];
for (const h of koLinks) {
  if (h.startsWith('#')) { linkRes.push({ h, st: 'anchor' }); continue; }
  const u = h.startsWith('http') ? h : BASE + h;
  let st = 'ERR';
  try { const r = await ctx.request.get(u.includes('darimati.us') ? q(u) : u, { maxRedirects: 5, timeout: 20000 }); st = r.status(); } catch (e) { st = 'ERR ' + String(e).slice(0, 60); }
  linkRes.push({ h, st }); if (u.includes('darimati.us')) await sleep(1500);
}
for (const r of rows) {
  if (r.L === '/(ko)') continue;
  const bad = r.links.filter(h => h.startsWith('/') && !h.startsWith(r.L + '/') && h !== r.L);
  if (bad.length) problems.push(`${r.L} 링크 언어 앞부분 없음: ${bad.slice(0, 4).join(' ')}`);
  if (r.links.length !== koLinks.length) problems.push(`${r.L} 링크 개수 ${r.links.length} ≠ 한국어 ${koLinks.length}`);
}

// 판정
for (const r of rows) {
  if (r.status !== 200) problems.push(`${r.L} HTTP ${r.status}`);
  if (!r.has) problems.push(`${r.L} 새 홈(dm-h7) 없음`);
  if (r.missing.length) problems.push(`${r.L} 번역 빠짐 ${r.missing.join(' | ')}`);
  if (r.broken.length) problems.push(`${r.L} 깨진 사진 ${r.broken.join(' ')}`);
  if (r.ox > 0 || r.ox390 > 0) problems.push(`${r.L} 가로 넘침 1440:${r.ox} 390:${r.ox390}`);
  if (!r.pixels || r.pixels.length !== 1) problems.push(`${r.L} 픽셀 ${JSON.stringify(r.pixels)}`);
  if (!r.form) problems.push(`${r.L} 이메일 폼(Lead) 없음`);
  if (r.hangul > 0) problems.push(`${r.L} 한글 ${r.hangul}자 섞임`);
}
for (const l of linkRes) if (l.st !== 200 && l.st !== 'anchor') problems.push(`링크 ${l.h} → ${l.st}`);

const out = { when: new Date().toISOString(), base: BASE, preview: PREVIEW, rows: rows.map(({ links, ...r }) => ({ ...r, n_links: links.length })), links: linkRes, problems };
fs.writeFileSync('shots/home-audit.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
console.log(problems.length ? `❌ 문제 ${problems.length}건` : '✅ 문제 0건');
await b.close();
