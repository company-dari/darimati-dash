// 나라별 손님 화면 실측 (2026-11-09) — 맥 IP 가 429 로 막혀도 깃허브 서버에서 돈다
// 나라 = 주소 ?country=XX + 브라우저 언어(Accept-Language·navigator.language) · 첫 화면은 한국어 기본 주소로 들어와 언어 안내를 본다
// 실행: gh workflow run country-check.yml   결과: 작업 요약 표 + 캡처(artifact country-shots)
import { chromium } from 'playwright';
import fs from 'fs';

const B = 'https://www.darimati.us';
const ART = '/blogs/archive/ispo-2026-amsterdam-darimati-booth-bnb22';
const PDP = '/products/br-001-oyster-grey';
const C = [ // 나라, 브라우저 언어, 우리 언어 주소
  ['KR', 'ko-KR', ''], ['US', 'en-US', '/en'], ['GB', 'en-GB', '/en'], ['JP', 'ja-JP', '/ja'],
  ['DE', 'de-DE', '/de'], ['FR', 'fr-FR', '/fr'], ['ES', 'es-ES', '/es'], ['IT', 'it-IT', '/it'],
  ['NL', 'nl-NL', '/nl'], ['FI', 'fi-FI', '/fi'], ['PT', 'pt-PT', '/pt-pt'], ['SG', 'en-SG', '/en'], ['AU', 'en-AU', '/en'],
];
fs.mkdirSync('shots', { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const rows = [];
const b = await chromium.launch();
for (const [cc, lang, path] of C) {
  const ctx = await b.newContext({ locale: lang, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    extraHTTPHeaders: { 'Accept-Language': lang + ',' + lang.split('-')[0] + ';q=0.9' } });
  const p = await ctx.newPage();
  const r = { cc, lang };
  try {
    // ① 첫 화면(한국어 기본 주소로 들어온 손님) — 언어 안내가 뜨나
    await p.goto(`${B}/?country=${cc}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(3500);
    r.first = await p.evaluate(() => {
      const el = [...document.querySelectorAll('[id*=lang-suggest],[class*=lang-suggest],[class*=dm-ls]')].find(e => e.offsetParent);
      return { locale: Shopify.locale, cur: Shopify.currency?.active, suggest: el ? el.innerText.replace(/\s+/g, ' ').slice(0, 60) : '' };
    });
    await wait(2000);
    // ② 상품 상세(그 나라 언어 주소)
    await p.goto(`${B}${path}${PDP}?country=${cc}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await wait(2500);
    r.pdp = await p.evaluate(() => {
      const t = document.body.innerText;
      const price = (t.match(/(₩\s?[\d,]+|\$\s?[\d,.]+|€\s?[\d,.]+|£\s?[\d,.]+|¥\s?[\d,]+|[\d.,]+\s?€|S\$\s?[\d.,]+|A\$\s?[\d.,]+)/) || [''])[0];
      return { locale: Shopify.locale, cur: Shopify.currency?.active, price, http: 200 };
    });
    await wait(2000);
    // ③ 블로그 글(그 나라 언어 주소) — 버튼·제품 카드·한국어 섞임·픽셀
    const resp = await p.goto(`${B}${path}${ART}?country=${cc}`, { waitUntil: 'networkidle', timeout: 60000 });
    r.art = await p.evaluate(() => {
      const body = document.querySelector('.dm-body')?.innerText || '';
      const q = s => [...document.querySelectorAll(s)];
      return {
        locale: Shopify.locale, cur: Shopify.currency?.active, title: document.querySelector('.dm-head h1')?.innerText.slice(0, 40) || '',
        hangul: (body.match(/[가-힣]/g) || []).length, raw: body.includes('[CTA]'),
        cta: q('.dm-cta-btn').map(a => a.innerText.trim() + ' →' + (a.getAttribute('href') || '').split('/products/')[0]),
        cardTitle: q('.dm-shop__hd h2').map(e => e.innerText)[0] || '',
        cards: q('.dm-shop__card').length, cardPrice: q('.dm-shop__price').map(e => e.innerText.split('\n')[0])[1] || '',
        cardTags: q('.dm-shop__tag').map(e => e.innerText).join(','), fbq: typeof fbq,
        ox: document.documentElement.scrollWidth > innerWidth,
      };
    });
    r.art.http = resp?.status();
    const sec = p.locator('.dm-shop');
    if (await sec.count()) { await sec.scrollIntoViewIfNeeded(); await wait(800); await p.screenshot({ path: `shots/${cc}-cards.png` }); }
    const cta = p.locator('.dm-cta-btn').first();
    if (await cta.count()) { await cta.scrollIntoViewIfNeeded(); await wait(500); await p.screenshot({ path: `shots/${cc}-cta.png` }); }
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
fs.writeFileSync('report.md', md);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
console.log(md);
