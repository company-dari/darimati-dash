// 블랙 공식 상세(gb) 나라별 손님 화면 실측 (2026-11-09) — 한국=종료 팝업(대기), 해외=바로 구매
// 실행: gh workflow run black-gate-check.yml → 로그 표 + 캡처(artifact black-gate-shots)
import { chromium } from 'playwright';
const B = 'https://www.darimati.us', P = '/products/br-001-core-black-gb';
const CC = (process.env.CC || 'KR,US,JP,DE').split(',');
const b = await chromium.launch();
for (const cc of CC) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });   // 매번 깨끗한 창(열쇠 없음)
  const p = await ctx.newPage();
  await p.goto(`${B}${P}?country=${cc}`, { waitUntil: 'load', timeout: 60000 });
  await p.waitForTimeout(3500);
  const r = await p.evaluate(() => {
    const d = document.getElementById('dmpc');
    return {
      country: (window.Shopify && Shopify.country) || '',
      popup: !!d && getComputedStyle(d).display !== 'none' && getComputedStyle(d).visibility !== 'hidden',
      title: (document.querySelector('h1')?.innerText || '').replace(/\s+/g, ' ').slice(0, 50),
      sizesOpen: [...document.querySelectorAll('input[type=radio]')].filter(i => !i.disabled && /\d{3}/.test(i.value)).map(i => i.value).join(','),
      fbq: typeof window.fbq === 'function',
    };
  });
  console.log(`${cc} | 접속국가=${r.country} | 종료팝업=${r.popup ? '뜸' : '없음'} | 제목=${r.title} | 열린사이즈=${r.sizesOpen} | 픽셀=${r.fbq}`);
  await p.screenshot({ path: `shot-${cc}.png` });
  await ctx.close();
}
await b.close();
