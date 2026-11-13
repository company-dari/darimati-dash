// 헤더 로고 겹침(여러 페이지 × 폭) + 홈 「소식 받기」 시험 제출 — 2026-11-13 홈 v7
// 사용: node tools/header-form-check.mjs <기본주소> <미리보기ID|''> <시험 이메일|''>
import { chromium } from 'playwright'; import fs from 'fs';
const [BASE = 'https://www.darimati.us', PV = '', EMAIL = ''] = process.argv.slice(2);
const q = p => p + (PV ? (p.includes('?') ? '&' : '?') + 'preview_theme_id=' + PV : '');
const PAGES = ['/', '/products/br-001-oyster-grey', '/collections/all', '/pages/lookbook', '/blogs/story', '/en/', '/ja/'];
const WIDTHS = [360, 390, 430, 768, 1440];
fs.mkdirSync('shots', { recursive: true });
const b = await chromium.launch(); const ctx = await b.newContext({ locale: 'ko-KR' });
const out = { header: [], form: null };
for (const path of PAGES) {
  const p = await ctx.newPage(); await p.setViewportSize({ width: 390, height: 844 });
  const r = await p.goto(BASE + q(path), { waitUntil: 'load' }); await p.waitForTimeout(2000);
  for (const w of WIDTHS) {
    await p.setViewportSize({ width: w, height: w > 760 ? 900 : 844 }); await p.waitForTimeout(800);
    const m = await p.evaluate(() => {
      document.querySelectorAll('body *').forEach(e => { const cs = getComputedStyle(e); if (cs.position === 'fixed' && /미리보기 화면|쿠키|cookie/i.test(e.textContent || '') && (e.textContent || '').length < 600 && !e.closest('header')) e.style.display = 'none'; });
      const logo = [...document.querySelectorAll('.header-logo__image-container--original')].find(e => e.getBoundingClientRect().width > 0);
      if (!logo) return { err: 'no logo' };
      const L = logo.getBoundingClientRect(); const sym = logo.querySelector('.dm-symbol svg'); const S = sym ? sym.getBoundingClientRect() : null;
      let worst = 0, who = '';
      document.querySelectorAll('header svg, header img, header button, header a').forEach(el => {
        if (logo.contains(el) || el.contains(logo)) return; const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4 || r.top > 120) return;
        const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return;
        const ox = Math.min(L.right, r.right) - Math.max(L.left, r.left), oy = Math.min(L.bottom, r.bottom) - Math.max(L.top, r.top);
        if (ox > -4 && oy > 0 && ox + 4 > worst) { worst = Math.round(ox + 4); who = (el.getAttribute('aria-label') || el.closest('[aria-label]')?.getAttribute('aria-label') || el.tagName).slice(0, 30); }
      });
      return { logo: [Math.round(L.left), Math.round(L.right)], symbol: S ? Math.round(S.width) : 0, tight_px: worst, with: who, ox: document.documentElement.scrollWidth - innerWidth };
    });
    const name = `hdr_${path.replace(/[^a-z0-9]+/gi, '_')}_${w}.png`;
    await p.screenshot({ path: 'shots/' + name, clip: { x: 0, y: 0, width: w, height: 80 } });
    out.header.push({ path, w, status: r.status(), ...m });
  }
  await p.close(); await new Promise(z => setTimeout(z, 1500));
}
if (EMAIL) {
  const p = await ctx.newPage(); await p.setViewportSize({ width: 1440, height: 900 });
  await p.addInitScript(() => { window.__ev = []; let real; Object.defineProperty(window, 'fbq', { configurable: true, get() { return real; }, set(f) { const w = function () { try { window.__ev.push(arguments[0] + ':' + arguments[1]); } catch (e) {} return f.apply(this, arguments); }; Object.assign(w, f); w.getState = f.getState; real = w; } }); });
  await p.goto(BASE + q('/'), { waitUntil: 'load' }); await p.waitForTimeout(2500);
  const f = p.locator('#dm-h7-mail'); await f.scrollIntoViewIfNeeded(); await f.fill(EMAIL);
  let lead = [];
  p.on('framenavigated', () => {});
  await p.evaluate(() => document.querySelector('#dm-h7-news').addEventListener('submit', () => { sessionStorage.setItem('__ev', JSON.stringify(window.__ev)); }, { capture: false }));
  await Promise.all([p.waitForNavigation({ timeout: 20000 }).catch(() => null), p.locator('#dm-h7-news button[type=submit]').click()]);
  await p.waitForTimeout(3000);
  try { lead = JSON.parse(await p.evaluate(() => sessionStorage.getItem('__ev')) || '[]'); } catch (e) {}
  const after = await p.evaluate(() => ({ url: location.href.replace(/^https?:\/\/[^/]+/, ''), captcha: !!document.querySelector('iframe[src*="hcaptcha"], .shopify-challenge__container, form[action*="challenge"]'),
    consent: (document.querySelector('.dm-h7-consent') || {}).innerText, errors: (document.querySelector('.dm-h7 .errors, #dm-h7-news .errors') || {}).innerText || '' }));
  await p.screenshot({ path: 'shots/form-after.png', fullPage: false });
  const club = p.locator('#club'); if (await club.count()) { await club.scrollIntoViewIfNeeded(); await p.waitForTimeout(800); await club.screenshot({ path: 'shots/form-club.png' }).catch(() => {}); }
  out.form = { email: EMAIL, lead_calls: lead.filter(x => /Lead|track:/.test(x)), ...after };
}
fs.writeFileSync('shots/header-form.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.form, null, 1));
for (const h of out.header) if (h.err || h.tight_px > 0 || h.ox > 0) console.log('⚠️', JSON.stringify(h));
await b.close();
