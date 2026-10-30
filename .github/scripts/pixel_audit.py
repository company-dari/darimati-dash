#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
픽셀 전수 실측 (2026-10-30 사장님 「모든 랜딩 픽셀 절대 틀리면 안 됨 · 모든 국가 광고」)

깃허브 서버에서 **진짜 크롬**으로 각 페이지를 열고, 페이스북으로 실제 나가는 요청을 센다.
(맥에서 돌리면 darimati.us 가 429 로 막는다 → 반드시 여기서)

판정(페이지마다):
  ✅ = 우리 픽셀(821311187492862) PageView 가 **정확히 1번** 나감 + 다른 픽셀 ID 없음 + 화면 200
  🔴 = PageView 0번(측정 끊김) · 2번 이상(숫자 부풀림) · 다른 ID 섞임 · 화면 오류
대상: 상점의 모든 공개 페이지·상품·모음·블로그 글 × 한국어·영어 (+ 핵심 페이지는 9개 언어 전부)
      + github.io 옛 영문 랜딩 6개
결과: /tmp/pixel.md (요약) · 문제 있으면 종료코드 1 → 워크플로가 슬랙·이슈로 알림
"""
import json, re, sys, time, urllib.request
from playwright.sync_api import sync_playwright

PIXEL = '821311187492862'
SHOP = 'https://www.darimati.us'
SF = 'https://darimati.us/api/2025-07/graphql.json'
LANGS_ALL = ['', '/en', '/ja', '/de', '/fr', '/es', '/it', '/nl', '/pt', '/fi']   # 🪤 포르투갈어 주소는 /pt
CORE = ['/', '/collections/shoes', '/products/br-001-sand-beige', '/products/br-001-oyster-grey',
        '/products/br-001-core-black-gb', '/pages/lookbook', '/pages/brand', '/cart']
OLD_LANDINGS = ['s1-landing.html', 's1-landing-kr.html', 's2-landing.html', 's2-landing-white.html',
                'br001-shop.html', 'product-br001.html', 'qr-mangrove.html']


def sf(q):
    req = urllib.request.Request(SF, json.dumps({'query': q}).encode(), {'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)['data']


def targets():
    d = sf('''{ pages(first:100){nodes{handle}} products(first:100){nodes{handle}}
               collections(first:50){nodes{handle}} blogs(first:10){nodes{handle articles(first:50){nodes{handle}}}} }''')
    paths = ['/pages/' + p['handle'] for p in d['pages']['nodes']]
    paths += ['/products/' + p['handle'] for p in d['products']['nodes']]
    paths += ['/collections/' + c['handle'] for c in d['collections']['nodes']]
    for b in d['blogs']['nodes']:
        paths += [f"/blogs/{b['handle']}/{a['handle']}" for a in b['articles']['nodes']]
    paths = ['/'] + sorted(set(paths))
    urls = []
    for p in paths:                       # 모든 페이지 × 한국어·영어
        for lg in ['', '/en']:
            urls.append(SHOP + lg + (p if p != '/' else '/'))
    for p in CORE:                        # 핵심 페이지 × 나머지 8개 언어
        for lg in LANGS_ALL[2:]:
            urls.append(SHOP + lg + p)
    urls += [f'https://darimati.github.io/inventory-dashboard/{x}' for x in OLD_LANDINGS]
    return urls


def main():
    urls = targets()
    print(f'대상 {len(urls)}개', flush=True)
    rows, bad = [], []
    with sync_playwright() as pw:
        br = pw.chromium.launch()
        ctx = br.new_context(locale='en-US', user_agent=(
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) '
            'Chrome/130.0 Safari/537.36 darimati-pixel-audit'))
        # 자동 언어 전환·언어 창이 끼어들지 않게(측정 대상은 「그 주소의 페이지」)
        ctx.add_init_script("try{localStorage.setItem('dm_lang_choice','1');localStorage.setItem('dm_loc_seen','1')}catch(e){}")
        for i, u in enumerate(urls, 1):
            hits = []
            page = ctx.new_page()

            def on_req(r):
                if 'facebook.com/tr' in r.url or 'facebook.com/privacy_sandbox' in r.url:
                    m_id = re.search(r'[?&]id=(\d+)', r.url)
                    m_ev = re.search(r'[?&]ev=([^&]+)', r.url)
                    body = ''
                    try:
                        body = r.post_data or ''
                    except Exception:
                        pass
                    if not m_id:
                        m_id = re.search(r'(?:^|&)id=(\d+)', body)
                        m_ev = re.search(r'(?:^|&)ev=([^&]+)', body)
                    hits.append((m_id.group(1) if m_id else '?', m_ev.group(1) if m_ev else '?'))
            ctx.on('request', on_req)
            status, err = 0, ''
            try:
                resp = page.goto(u, wait_until='load', timeout=45000)
                status = resp.status if resp else 0
                page.wait_for_timeout(6000)          # 쇼피파이 픽셀은 늦게 뜬다(dm-track 는 최대 3초 기다림)
            except Exception as e:
                err = str(e)[:80]
            ctx.remove_listener('request', on_req)
            page.close()
            pv = sum(1 for pid, ev in hits if pid == PIXEL and ev == 'PageView')
            others = sorted({pid for pid, ev in hits if pid not in (PIXEL, '?')})
            ok = status == 200 and pv == 1 and not others and not err
            why = []
            if status != 200: why.append(f'HTTP {status}')
            if err: why.append('열기 실패')
            if pv == 0: why.append('PageView 0')
            if pv > 1: why.append(f'PageView {pv}번(중복)')
            if others: why.append('다른 픽셀 ' + ','.join(others))
            short = u.replace(SHOP, '').replace('https://darimati.github.io/inventory-dashboard/', 'github.io/') or '/'
            evs = sorted({ev for pid, ev in hits if pid == PIXEL})
            rows.append(f"| {'✅' if ok else '🔴'} | {short} | {status} | {pv} | {', '.join(evs)[:60]} | {' · '.join(why)} |")
            if not ok:
                bad.append(f'{short} — {" · ".join(why)}')
            print(f'[{i}/{len(urls)}] {"OK " if ok else "BAD"} {short} pv={pv} {why}', flush=True)
            time.sleep(1.5)                          # 429 방지
        br.close()
    head = [f'# 픽셀 전수 실측 — {time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime())}',
            f'대상 {len(urls)} · 정상 {len(urls) - len(bad)} · 문제 {len(bad)}', '',
            '| | 주소 | HTTP | PageView | 우리 픽셀 이벤트 | 문제 |', '|---|---|---|---|---|---|']
    open('/tmp/pixel.md', 'w').write('\n'.join(head + rows) + '\n')
    open('/tmp/pixel_bad.txt', 'w').write('\n'.join(bad))
    print(f'\n정상 {len(urls) - len(bad)} / {len(urls)} · 문제 {len(bad)}')
    for b in bad[:40]:
        print(' 🔴', b)
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
