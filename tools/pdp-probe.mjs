// 상세 페이지를 실제 브라우저(폰 390)로 열어 판정 — 미리보기 테마도 쿠키 유지라 정확 (11/14 VT-001 한국 사전예약 점검용으로 시작)
// 사용: node tools/pdp-probe.mjs "<주소>" [open]   · open = 「사전예약 신청」 버튼을 눌러 창이 열리는지까지
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const URL = process.argv[2], CLICK = process.argv[3] === 'open', PC = process.argv[4] === 'pc'; // pc = 1440×900 PC 창
const b = await chromium.launch();
const ctx = await b.newContext(PC ? { viewport: { width: 1440, height: 900 }, locale: 'ko-KR' } : { ...devices['iPhone 13'], locale: 'ko-KR' });
const p = await ctx.newPage();
await p.addInitScript(() => { window.__ev = []; const w = () => { if (window.fbq && !window.fbq.__w) { const o = window.fbq; const f = function () { try { window.__ev.push([arguments[0], arguments[1]]); } catch (e) {} return o.apply(this, arguments); }; Object.assign(f, o); f.__w = 1; window.fbq = f; } }; setInterval(w, 200); });
const res = await p.goto(URL, { waitUntil: 'load', timeout: 60000 }); await p.waitForTimeout(3500);
await p.addStyleTag({ content: '#shopify-pc__banner,.shopify-pc__banner__dialog,#PBarNextFrame,#preview-bar-iframe{display:none!important}' });
fs.mkdirSync('shots', { recursive: true });
// 11/24 open=closer → 「Look closer」 칸을 2초 간격 8장 (16초 움직이는 장면 판정용)
if (process.argv[3] === 'closer') {
  const el = p.locator('.dm-p8 #closer:visible, .dm-p8 #closer-m:visible').first();
  await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(500);
  for (let i = 0; i < 8; i++) { await el.screenshot({ path: `shots/closer-${String(i).padStart(2, '0')}.jpg`, type: 'jpeg', quality: 72 }); await p.waitForTimeout(2000); }
  await b.close(); process.exit(0);
}
// 11/24 open=long → 페이지 끝까지 스크롤(지연 사진 불러오기) 후 2400px 조각 캡처만 하고 끝 (시안 대조용)
if (process.argv[3] === 'long') {
  let H = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += 600) { await p.evaluate(y => scrollTo(0, y), y); await p.waitForTimeout(150); H = await p.evaluate(() => document.documentElement.scrollHeight); }
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(2500);
  const W = PC ? 1440 : 390, n = Math.ceil(H / 2400);
  for (let i = 0; i < n; i++) await p.screenshot({ path: `shots/long-${W}-${String(i).padStart(2, '0')}.jpg`, type: 'jpeg', quality: 72, fullPage: true, clip: { x: 0, y: i * 2400, width: W, height: Math.min(2400, H - i * 2400) } });
  console.log(JSON.stringify({ status: res.status(), H, ox: await p.evaluate(() => document.documentElement.scrollWidth - innerWidth), broken: await p.evaluate(() => [...document.images].filter(i => i.complete && i.naturalWidth === 0).length), chunks: n }));
  await b.close(); process.exit(0);
}
const vis = s => `[...document.querySelectorAll(${JSON.stringify(s)})].filter(e=>{const r=e.getBoundingClientRect(),c=getComputedStyle(e);return r.width>0&&r.height>0&&c.display!=='none'&&c.visibility!=='hidden'}).length`;
const info = await p.evaluate(`({
  url: location.href, preview: !!document.querySelector('#PBarNextFrame, #preview-bar-iframe, .dm-preview-banner, [class*=dm-preview]'),
  ks_buttons: ${vis('[data-dm="KickstarterClickout"]')},
  vtn_section: ${vis('#vtn')},
  preorder_cta: ${vis('.dmvp__cta[data-open]')},
  price_visible: ${vis('.dmc-bh__price')},
  won_text_visible: [...document.querySelectorAll('main *')].filter(e=>e.children.length===0 && /₩\\s?\\d/.test(e.textContent) && e.getBoundingClientRect().height>0 && getComputedStyle(e).display!=='none').map(e=>e.textContent.trim().slice(0,30)).slice(0,5),
  add_to_cart: ${vis('button[name="add"], .add-to-cart-button, .shopify-payment-button, sticky-add-to-cart')},
  variant_picker: (()=>{const v=document.querySelector('variant-picker');return v?getComputedStyle(v).pointerEvents+' op'+getComputedStyle(v).opacity:null})(),
  tabs: ${vis('[data-dmc-tabs]')},
  picker_items: [...document.querySelectorAll('variant-picker label, variant-picker button')].slice(0,12).map(e=>(e.tagName+'.'+String(e.className).slice(0,40)+' |'+e.textContent.trim().slice(0,20)+'| '+Math.round(e.getBoundingClientRect().width)+'x'+Math.round(e.getBoundingClientRect().height))),
  detail: ${vis('.dm-vt')},
  ox: document.documentElement.scrollWidth - innerWidth,
  fbq_pixels: (()=>{try{return fbq.getState().pixels.map(x=>x.id)}catch(e){return null}})(),
})`);
await p.screenshot({ path: 'shots/p0.jpg', type: 'jpeg', quality: 70 });
await p.evaluate(() => scrollTo(0, innerHeight * 1.2)); await p.waitForTimeout(900);
await p.screenshot({ path: 'shots/p1.jpg', type: 'jpeg', quality: 70 });
if (CLICK && info.preorder_cta) {
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(500);
  await p.evaluate(() => document.querySelector('#dmvp .dmvp__cta').click()); await p.waitForTimeout(800);
  info.modal_open = await p.evaluate(() => { const m = document.getElementById('dmvpm') || document.getElementById('dmvp-modal'); return !!m && !m.hidden; });
  info.modal_text = await p.evaluate(() => (document.querySelector('#dmvpm .dmvpm-card')?.innerText || '').replace(/\s+/g, ' ').slice(0, 220));
  info.modal_size_buttons = await p.evaluate(() => document.querySelectorAll('#dmvpm [data-size], #dmvp-modal [data-size]').length);
  await p.screenshot({ path: 'shots/p2-modal.jpg', type: 'jpeg', quality: 70 });
  // 번호 없이 제출 → 안내문(보내지 않음) 확인 · 실제 접수 안 함
  await p.evaluate(() => document.querySelector('#dmvpm button[type=submit]')?.click()); await p.waitForTimeout(400);
  info.modal_hint = await p.evaluate(() => document.querySelector('#dmvpm .dmvpm-msg')?.textContent);
}
// 11/16 킥스타터 배너(.dmks) 위치 캡처
info.ks_banner = await p.evaluate(() => { const m = document.getElementById('dmvpm'); if (m) m.hidden = true; document.documentElement.classList.remove('dmvpm-lock'); const e = document.querySelector('.dmks'); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); });
if (info.ks_banner) { await p.waitForTimeout(700); await p.screenshot({ path: 'shots/p3-banner.jpg', type: 'jpeg', quality: 70 }); }
// 사이즈 칸 모양: 모두 같은 배경인지(선택된 것처럼 보이는 칸 없음)
info.sizes = await p.evaluate(() => [...document.querySelectorAll('variant-picker .variant-option__button-label')].filter(l => l.offsetWidth > 0).map(l => (l.textContent.match(/\d{3}/)||[''])[0]).join(','));
info.size_bg = await p.evaluate(() => [...new Set([...document.querySelectorAll('variant-picker .variant-option__button-label')].filter(l => l.offsetWidth > 0).map(l => getComputedStyle(l).backgroundColor))]);
info.status = res.status(); info.fbq_events = await p.evaluate(() => (window.__ev || []).map(e => e[1]));
console.log(JSON.stringify(info, null, 1));
await b.close();
