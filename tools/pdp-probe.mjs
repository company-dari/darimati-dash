// 상세 페이지를 실제 브라우저(폰 390)로 열어 판정 — 미리보기 테마도 쿠키 유지라 정확 (11/14 VT-001 한국 사전예약 점검용으로 시작)
// 사용: node tools/pdp-probe.mjs "<주소>" [open]   · open = 「사전예약 신청」 버튼을 눌러 창이 열리는지까지
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const URL = process.argv[2], CLICK = process.argv[3] === 'open';
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['iPhone 13'], locale: 'ko-KR' });
const p = await ctx.newPage();
await p.addInitScript(() => { window.__ev = []; const w = () => { if (window.fbq && !window.fbq.__w) { const o = window.fbq; const f = function () { try { window.__ev.push([arguments[0], arguments[1]]); } catch (e) {} return o.apply(this, arguments); }; Object.assign(f, o); f.__w = 1; window.fbq = f; } }; setInterval(w, 200); });
const res = await p.goto(URL, { waitUntil: 'load', timeout: 60000 }); await p.waitForTimeout(3500);
await p.addStyleTag({ content: '#shopify-pc__banner,.shopify-pc__banner__dialog,#PBarNextFrame,#preview-bar-iframe{display:none!important}' });
fs.mkdirSync('shots', { recursive: true });
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
  info.modal_open = await p.evaluate(() => { const m = document.getElementById('dmvp-modal'); return !!m && !m.hidden; });
  info.modal_sizes = await p.evaluate(() => [...document.querySelectorAll('#dmvp-modal [data-size]')].map(x => x.dataset.size));
  await p.screenshot({ path: 'shots/p2-modal.jpg', type: 'jpeg', quality: 70 });
  // 사이즈만 고르고 번호 없이 제출 → 안내문(보내지 않음) 확인 · 실제 접수 안 함
  await p.evaluate(() => { document.querySelectorAll('#dmvp-modal [data-size]')[3].click(); document.querySelector('#dmvp-modal .dm-ntf__go').click(); }); await p.waitForTimeout(400);
  info.modal_hint = await p.evaluate(() => document.querySelector('#dmvp-modal [data-hint]')?.textContent);
}
info.status = res.status(); info.fbq_events = await p.evaluate(() => (window.__ev || []).map(e => e[1]));
console.log(JSON.stringify(info, null, 1));
await b.close();
