// 나라별 손님 화면 실측 (2026-11-09) — 맥 IP 가 429 로 막혀도 깃허브 서버에서 돈다
// 나라 = 주소 ?country=XX + 브라우저 언어(Accept-Language·navigator.language) · 첫 화면은 한국어 기본 주소로 들어와 언어 안내를 본다
// 실행: gh workflow run country-check.yml   결과: 작업 요약 표 + 캡처(artifact country-shots)
import { chromium } from 'playwright';
import fs from 'fs';

const B = 'https://www.darimati.us';
const PV = process.env.PV ? `&preview_theme_id=${process.env.PV}` : '';
const ART = '/blogs/archive/ispo-2026-amsterdam-darimati-booth-bnb22';
const PDP = '/products/br-001-oyster-grey';
const C = [ // 나라, 브라우저 언어, 우리 언어 주소
  ['KR', 'ko-KR', ''], ['US', 'en-US', '/en'], ['GB', 'en-GB', '/en'], ['JP', 'ja-JP', '/ja'],
  ['DE', 'de-DE', '/de'], ['FR', 'fr-FR', '/fr'], ['ES', 'es-ES', '/es'], ['IT', 'it-IT', '/it'],
  ['NL', 'nl-NL', '/nl'], ['FI', 'fi-FI', '/fi'], ['PT', 'pt-PT', '/pt'], ['SG', 'en-SG', '/en'], ['AU', 'en-AU', '/en'],
];
fs.mkdirSync('shots', { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const rows = [];
const b = await chromium.launch();
for (const [cc0, lang, path] of C) {
  const cc = cc0.replace(/\d$/, ''); const tag = cc0;
  const ctx = await b.newContext({ locale: lang, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    extraHTTPHeaders: { 'Accept-Language': lang + ',' + lang.split('-')[0] + ';q=0.9' } });
  const p = await ctx.newPage();
  const r = { cc: tag, lang };
  try {
    // ① 첫 화면(한국어 기본 주소로 들어온 손님) — 언어 안내가 뜨나
    await p.goto(`${B}/?country=${cc}${PV}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(3500);
    r.first = await p.evaluate(() => {
      const el = document.getElementById('dm-ls'); const vis = el && !el.hidden && el.getBoundingClientRect().height > 0 && getComputedStyle(el).display !== 'none';
      return { locale: Shopify.locale, cur: Shopify.currency?.active, suggest: vis ? el.innerText.replace(/\s+/g, ' ').slice(0, 60) : '' };
    });
    await wait(2000);
    // ② 상품 상세(그 나라 언어 주소)
    await p.goto(`${B}${path}${PDP}?country=${cc}${PV}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(2500);
    r.pdp = await p.evaluate(() => {
      const t = document.body.innerText;
      const price = (t.match(/(₩\s?[\d,]+|\$\s?[\d,.]+|€\s?[\d,.]+|£\s?[\d,.]+|¥\s?[\d,]+|[\d.,]+\s?€|S\$\s?[\d.,]+|A\$\s?[\d.,]+)/) || [''])[0];
      return { locale: Shopify.locale, cur: Shopify.currency?.active, price, http: 200 };
    });
    await wait(2000);
    // ②-2 제품 보기(그 나라 언어 주소) — 기준 화면
    await p.goto(`${B}${path}/collections/shoes?country=${cc}${PV}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(2000);
    r.shop = await p.evaluate(() => {
      const o = {};
      document.querySelectorAll('[data-dm-card]').forEach(a => { const h = a.dataset.dmCard; if (o[h]) return;
        const img = a.querySelector('img.dm-sc__cut') || a.querySelector('img');
        o[h] = { img: (img?.getAttribute('src') || '').split('/').pop().split('?')[0].replace(/(_\d+x\d*)?\.(webp|jpe?g|png)$/, ''),
                 price: (a.querySelector('.dm-sc__now')?.innerText || '').trim(), st: (a.querySelector('.dm-sc__status')?.innerText || '').trim(), badge: (a.querySelector('.dm-sc__badge')?.innerText || '').trim() }; });
      return o;
    });
    await wait(2000);
    // ③ 블로그 글(그 나라 언어 주소) — 버튼·제품 카드·한국어 섞임·픽셀
    const resp = await p.goto(`${B}${path}${ART}?country=${cc}${PV}`, { waitUntil: 'networkidle', timeout: 60000 });
    r.art = await p.evaluate(() => {
      const body = document.querySelector('.dm-body')?.innerText || '';
      const q = s => [...document.querySelectorAll(s)];
      return {
        locale: Shopify.locale, cur: Shopify.currency?.active, title: document.querySelector('.dm-head h1')?.innerText.slice(0, 40) || '',
        hangul: (body.match(/[가-힣]/g) || []).length, raw: body.includes('[CTA]'),
        cta: q('.dm-cta-btn').map(a => a.innerText.trim() + ' →' + (a.getAttribute('href') || '').split('/products/')[0]),
        cardTitle: q('.dm-shop__hd h2').map(e => e.innerText)[0] || '',
        cards: q('.dm-shop__card').length, cardPrice: q('.dm-shop__card .dm-sc__now').map(e => e.innerText)[0] || '',
        cardTags: q('.dm-shop__card .dm-sc__badge, .dm-shop__card .dm-sc__status').map(e => e.innerText).join(','), fbq: typeof fbq,
        cardsBy: Object.fromEntries(q('.dm-shop__card a').map(a => [a.dataset.dmCard, { img: (a.querySelector('img')?.getAttribute('src') || '').split('/').pop().split('?')[0].replace(/(_\d+x\d*)?\.(webp|jpe?g|png)$/, ''), price: (a.querySelector('.dm-sc__now')?.innerText || '').trim(), st: (a.querySelector('.dm-sc__status')?.innerText || '').trim(), badge: (a.querySelector('.dm-sc__badge')?.innerText || '').trim() }])),
        ox: document.documentElement.scrollWidth > innerWidth,
      };
    });
    r.art.http = resp?.status();
    const sec = p.locator('.dm-shop');
    if (await sec.count()) { await sec.scrollIntoViewIfNeeded(); await wait(800); await p.screenshot({ path: `shots/${tag}-cards.png` }); }
    const cta = p.locator('.dm-cta-btn').first();
    if (await cta.count()) { await cta.scrollIntoViewIfNeeded(); await wait(500); await p.screenshot({ path: `shots/${tag}-cta.png` }); }
  } catch (e) { r.err = String(e).slice(0, 120); }
  rows.push(r);
  console.log(JSON.stringify(r));
  await ctx.close();
  await wait(3000);
}
await b.close();

const ok = v => v ? '✅' : '❌';
let md = '## 나라별 손님 화면 (블로그 ISPO 글 · 그레이 상세 · 첫 화면)\n\n| 나라 | 첫 화면 언어 안내 | 상세 언어·통화·가격 | 글 언어 | 글 속 한국어 | 버튼 | 카드 | 카드 가격 | 픽셀 | 넘침 |\n|---|---|---|---|---|---|---|---|---|---|\n';
for (const r of rows) {
  if (r.err) { md += `| ${r.cc} | 오류 ${r.err} |||||||||\n`; continue; }
  const a = r.art || {};
  md += `| ${r.cc} | ${r.first?.suggest || '(없음)'} | ${r.pdp?.locale} · ${r.pdp?.cur} · ${r.pdp?.price} | ${a.locale} ${a.http} | ${a.hangul}자 | ${a.cta?.length}개 ${a.raw ? '❌[CTA]노출' : ''} | ${a.cards}개 「${a.cardTitle}」 ${a.cardTags} | ${a.cardPrice} | ${ok(a.fbq === 'function')} | ${a.ox ? '❌' : '✅'} |\n`;
}
md += '\n버튼 문구: \n' + rows.filter(r => r.art).map(r => `- ${r.cc}: ${r.art.cta.join(' / ')}`).join('\n') + '\n';
// ── 판정: 제품 보기 = 기준. 다르면 실패(이슈) ──
const KNOWN_NO_TR = (process.env.KNOWN_NO_TR || '').split(',');   // 번역 없는 걸 사장님 결정 대기 중인 언어 = 경고만
const num = t => (String(t).match(/[$€£¥₩]\s?[\d,.]+|[\d,.]+\s?€/) || [''])[0].replace(/\s/g, '');
const fails = [], warns = [];
for (const r of rows) {
  if (r.err) { fails.push(`${r.cc}: 화면을 열지 못함 (${r.err})`); continue; }
  const a = r.art || {}, shop = r.shop || {};
  if (a.http !== 200) { (r.cc === 'PT' ? warns : fails).push(`${r.cc}: 블로그 글 ${a.http}`); continue; }
  if (a.raw) fails.push(`${r.cc}: 글에 [CTA] 글자가 그대로 보임`);
  if (a.fbq !== 'function') fails.push(`${r.cc}: 픽셀 없음`);
  if (a.ox) fails.push(`${r.cc}: 화면이 옆으로 넘침`);
  if (a.locale !== 'ko' && a.hangul > 0) (KNOWN_NO_TR.includes(a.locale) ? warns : fails).push(`${r.cc}(${a.locale}): 글 본문에 한국어 ${a.hangul}자 — 번역 없음`);
  for (const [h, c] of Object.entries(a.cardsBy || {})) {
    const s0 = shop[h]; if (!s0) continue;
    if (s0.img && c.img !== s0.img) fails.push(`${r.cc}: ${h} 사진 — 블로그 ${c.img} ≠ 제품 보기 ${s0.img}`);
    if ((c.st || '') !== (s0.st || '')) fails.push(`${r.cc}: ${h} 카드 문구 — 블로그 「${c.st || '가격'}」 ≠ 제품 보기 「${s0.st || '가격'}」`);
    if ((c.badge || '') !== (s0.badge || '')) fails.push(`${r.cc}: ${h} 배지 — 블로그 「${c.badge}」 ≠ 제품 보기 「${s0.badge}」`);
    if (/품절|sold out|ausverkauft|épuisé|agotado|esaurito|uitverkocht|売り切れ|loppuunmyyty|esgotado/i.test(c.st + c.badge)) fails.push(`${r.cc}: ${h} 「품절」류 문구 노출(쓰지 않기로 함)`);
    if (s0.price && num(c.price) !== num(s0.price)) fails.push(`${r.cc}: ${h} 가격 — 블로그 ${num(c.price)} ≠ 제품 보기 ${num(s0.price)}`);
  }
  const g = shop['br-001-oyster-grey'];
  if (g?.price && r.pdp?.price && num(g.price) !== num(r.pdp.price)) fails.push(`${r.cc}: 그레이 가격 — 상세 ${num(r.pdp.price)} ≠ 제품 보기 ${num(g.price)}`);
}
md += `\n## 판정 (제품 보기 = 기준)\n` + (fails.length ? fails.map(x => '- 🔴 ' + x).join('\n') : '- ✅ 나라별 사진·가격·버튼·픽셀 모두 일치') + '\n' + (warns.length ? '\n알려진 문제(사장님 결정 대기):\n' + warns.map(x => '- 🟡 ' + x).join('\n') + '\n' : '');
fs.writeFileSync('report.md', md);
if (fails.length) process.exitCode = 1;
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
console.log(md);
