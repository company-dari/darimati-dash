// 상세 페이지를 실제 브라우저(폰 390)로 열어 판정 — 미리보기 테마도 쿠키 유지라 정확 (11/14 VT-001 한국 사전예약 점검용으로 시작)
// 사용: node tools/pdp-probe.mjs "<주소>" [open]   · open = 「사전예약 신청」 버튼을 눌러 창이 열리는지까지
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const URL = process.argv[2], CLICK = process.argv[3] === 'open', PC = process.argv[4] === 'pc' || /^\d+$/.test(process.argv[4] || ''); const PW = /^\d+$/.test(process.argv[4] || '') ? +process.argv[4] : 1440; // pc = 1440×900 PC 창 · 숫자 = 그 너비 PC 창(시안 대조용 11/24)
const b = await chromium.launch();
const ctx = await b.newContext(PC ? { viewport: { width: PW, height: 900 }, locale: 'ko-KR' } : { ...devices['iPhone 13'], locale: 'ko-KR' });
// 11/24 깃허브 서버는 미국 → 한국 손님 화면(원화·한국 배송)으로 보이게 나라 쿠키
await ctx.addCookies(['localization', 'cart_currency'].map((n, i) => ({ name: n, value: i ? 'KRW' : 'KR', domain: 'darimati.us', path: '/' })));
const p = await ctx.newPage();
await p.addInitScript(() => { window.__ev = []; const w = () => { if (window.fbq && !window.fbq.__w) { const o = window.fbq; const f = function () { try { window.__ev.push([arguments[0], arguments[1]]); } catch (e) {} return o.apply(this, arguments); }; Object.assign(f, o); f.__w = 1; window.fbq = f; } }; setInterval(w, 200); });
let res = await p.goto(URL, { waitUntil: 'load', timeout: 60000 }); await p.waitForTimeout(1500);
// 11/24 쿠키로 안 바뀌면 쇼피파이 나라 바꾸기 양식(/localization)으로 한국 지정 후 다시 열기
if (!(await p.evaluate(() => (window.Shopify && Shopify.currency && Shopify.currency.active) === 'KRW'))) {
  await p.evaluate(async () => { const f = new FormData(); f.append('form_type', 'localization'); f.append('utf8', '✓'); f.append('_method', 'put'); f.append('country_code', 'KR'); f.append('return_to', '/'); await fetch('/localization', { method: 'POST', body: f, credentials: 'include' }); });
  res = await p.goto(URL, { waitUntil: 'load', timeout: 60000 });
}
console.log('currency', await p.evaluate(() => window.Shopify && Shopify.currency && Shopify.currency.active)); await p.waitForTimeout(3500);
await p.addStyleTag({ content: '#shopify-pc__banner,.shopify-pc__banner__dialog,#PBarNextFrame,#preview-bar-iframe{display:none!important}' });
fs.mkdirSync('shots', { recursive: true });
// 11/24 open=ig → 상세 레이스 데이 인스타 인터뷰 칸 눌러 이 자리 재생되는지(주소 그대로·인스타 iframe·ContentPlay) + 칸 캡처
if (process.argv[3] === 'ig') {
  const before = p.url(); const a = p.locator('[data-p8-ig]:visible').first(); await a.scrollIntoViewIfNeeded(); await p.waitForTimeout(800);
  await a.click(); await p.waitForTimeout(6000);
  const r = await p.evaluate(() => ({ iframe: !!document.querySelector('.dm-p8-igm iframe'), ev: (window.__ev || []).map(e => e[1]).filter(x => typeof x === 'string') }));
  await p.screenshot({ path: 'shots/ig-after.jpg', type: 'jpeg', quality: 75 });
  // 재생 버튼 눌러보기(인스타 안쪽)
  try { const fr = p.frameLocator('.dm-p8-igm iframe'); await fr.locator('video, [role=button]').first().click({ timeout: 5000 }); await p.waitForTimeout(3000); } catch (e) {}
  await p.screenshot({ path: 'shots/ig-play.jpg', type: 'jpeg', quality: 75 });
  console.log(JSON.stringify({ sameUrl: p.url() === before, pages: ctx.pages().length, ...r })); await b.close(); process.exit(0);
}
// 11/24 open=topyt → 홈 맨 위 띠 「영상 보기」 눌러 페이지 이탈 없이 위 창 재생되는지(주소 그대로·유튜브 창·ContentPlay)
if (process.argv[3] === 'topyt') {
  const before = p.url(); const a = p.locator('[data-h8-yt]').first(); await a.scrollIntoViewIfNeeded(); await a.click(); await p.waitForTimeout(3000);
  const r = await p.evaluate(() => ({ iframe: !!document.querySelector('.dm-h8-ytm iframe'), ev: (window.__ev || []).map(e => e[1]).filter(Boolean) }));
  await p.screenshot({ path: 'shots/topyt-open.jpg', type: 'jpeg', quality: 70 });
  await p.locator('.dm-h8-ytm button').click(); await p.waitForTimeout(500);
  const closed = await p.evaluate(() => !document.querySelector('.dm-h8-ytm'));
  console.log(JSON.stringify({ sameUrl: p.url() === before, pages: ctx.pages().length, ...r, closed })); await b.close(); process.exit(0);
}
// 11/24 open=sizes → Look closer 를 여러 화면 크기 × 3장면(옆·위·밑창)으로 캡처 + 설명 칸 겹침·화면 밖·잘림 숫자 판정
if (process.argv[3] === 'sizes') {
  const SZ = [[1280, 720], [1366, 768], [1440, 900], [1920, 1080], [2560, 1440], [1024, 768], [1008, 600], [820, 1180]];
  const out = [];
  for (const [w, h] of SZ) {
    await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(800);
    const sec = p.locator('.dm-p8 #closer:visible, .dm-p8 #closer-m:visible').first();
    const top = await sec.evaluate(e => e.getBoundingClientRect().top + scrollY); const H = await sec.evaluate(e => e.offsetHeight);
    for (const [k, f] of [['side', .12], ['top', .5], ['sole', .78]]) {
      await p.evaluate(y => scrollTo(0, y), top + (H - h) * f); await p.waitForTimeout(900);
      const r = await p.evaluate(() => {
        const vis = e => { const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > .5; };
        const boxes = [...document.querySelectorAll('.dm-p8 .dl-co')].filter(e => e.offsetParent && vis(e)).map(e => { const b = e.getBoundingClientRect(); return { n: e.className.match(/dl-c\d/)[0], l: b.left, t: b.top, r: b.right, b: b.bottom }; });
        const tabs = [...document.querySelectorAll('.dm-p8 .dl-st')].filter(e => e.offsetParent).map(e => e.getBoundingClientRect());
        const ttl = [...document.querySelectorAll('.dm-p8 #closer h2, .dm-p8 #closer-m h2')].filter(e => e.offsetParent).map(e => e.getBoundingClientRect())[0];
        const bar = document.querySelector('.dm-p8-sticky, [class*=sticky-atc], [class*=pdp-sticky]'); const bb = bar && bar.offsetParent ? bar.getBoundingClientRect() : null;
        const ov = (a, c) => a.l < c.right && a.r > c.left && a.t < c.bottom && a.b > c.top;
        const issues = [];
        boxes.forEach((a, i) => { boxes.slice(i + 1).forEach(c => { if (a.l < c.r && a.r > c.l && a.t < c.b && a.b > c.t) issues.push('겹침 ' + a.n + '·' + c.n); });
          if (a.l < 0 || a.r > innerWidth) issues.push('화면 밖(가로) ' + a.n); if (a.t < 0 || a.b > innerHeight) issues.push('화면 밖(세로) ' + a.n);
          if (ttl && ov(a, ttl)) issues.push('제목과 겹침 ' + a.n); tabs.forEach(t => { if (ov(a, t)) issues.push('탭과 겹침 ' + a.n); }); if (bb && ov(a, bb)) issues.push('구매 바와 겹침 ' + a.n); });
        return { shown: boxes.map(b => b.n).join(','), ox: document.documentElement.scrollWidth - innerWidth, issues };
      });
      await p.screenshot({ path: `shots/sz-${w}x${h}-${k}.jpg`, type: 'jpeg', quality: 60 });
      out.push({ size: `${w}x${h}`, k, ...r });
    }
  }
  console.log(JSON.stringify(out)); await b.close(); process.exit(0);
}
// 11/24 open=closer → 「Look closer」 칸을 2초 간격 8장 (16초 움직이는 장면 판정용)
if (process.argv[3] === 'closer') {
  const el = p.locator('.dm-p8 #closer:visible, .dm-p8 #closer-m:visible').first();
  await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(500);
  // 스크롤 연동 확인: 칸이 화면 아래에서 들어와 위로 나갈 때까지 8단계로 내리며 화면 캡처
  const box = await el.boundingBox(); const top0 = await p.evaluate(() => scrollY) + box.y; const vh = await p.evaluate(() => innerHeight);
  for (let i = 0; i < 8; i++) { const y = top0 - vh * 0.6 + (box.height + vh * 0.3) * i / 7; await p.evaluate(y => scrollTo(0, y), y); await p.waitForTimeout(700);
    await p.screenshot({ path: `shots/closer-${String(i).padStart(2, '0')}.jpg`, type: 'jpeg', quality: 70 }); }
  await b.close(); process.exit(0);
}
// 11/24 open=long → 페이지 끝까지 스크롤(지연 사진 불러오기) 후 2400px 조각 캡처만 하고 끝 (시안 대조용)
if (process.argv[3] === 'long') {
  let H = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < H; y += 600) { await p.evaluate(y => scrollTo(0, y), y); await p.waitForTimeout(150); H = await p.evaluate(() => document.documentElement.scrollHeight); }
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(2500);
  const W = PC ? PW : 390, n = Math.ceil(H / 2400);
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
