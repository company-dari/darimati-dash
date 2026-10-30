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
    only = __import__('os').environ.get('ONLY', '')
    if only:                                  # 빠른 시험: 주소에 이 글자가 든 것만
        urls = [u for u in urls if __import__('re').search(only, u)]
    print(f'대상 {len(urls)}개', flush=True)
    rows, bad = [], []
    with sync_playwright() as pw:
        br = pw.chromium.launch()
        # 10/30 첫 실행 교훈: 「자동화 브라우저」 표시가 있으면 쇼피파이·메타가 봇으로 보고 이벤트를 안 보낸다
        #   → 보통 크롬처럼(webdriver 숨김·일반 UA). 진짜 크롬 실측 = 이벤트 2개 정상 발송 확인
        ctx = br.new_context(locale='en-US', user_agent=(
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) '
            'Chrome/130.0.0.0 Safari/537.36'))
        ctx.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined})")
        # 페이스북으로 나가는 요청을 페이지 안에서 직접 센다(이미지·beacon·fetch 모두)
        ctx.add_init_script(r'''(function(){var L=window.__fbHits=[];function rec(u,b){try{u=String(u);if(!/facebook\.com\/(tr|privacy_sandbox)/.test(u))return;var s=u+'&'+(typeof b==='string'?b:'');var id=(s.match(/[?&]id=(\d+)/)||[])[1]||'?';var ev=(s.match(/[?&]ev=([^&]+)/)||[])[1]||'?';L.push(id+' '+ev)}catch(e){}}
var sb=navigator.sendBeacon&&navigator.sendBeacon.bind(navigator);if(sb)navigator.sendBeacon=function(u,b){rec(u,b);return sb(u,b)};
var f=window.fetch;window.fetch=function(u,o){rec(u&&u.url||u,o&&o.body);return f.apply(this,arguments)};
var d=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');Object.defineProperty(HTMLImageElement.prototype,'src',{set:function(v){rec(v);d.set.call(this,v)},get:function(){return d.get.call(this)}});
var xo=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){this.__u=u;return xo.apply(this,arguments)};var xs=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.send=function(b){rec(this.__u,b);return xs.apply(this,arguments)}})();''')
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
            status, err, inpage, state = 0, '', [], None
            for attempt in (1, 2):                   # 느린 페이지 한 번 더
                try:
                    resp = page.goto(u, wait_until='load', timeout=45000)
                    status = resp.status if resp else 0
                    page.wait_for_timeout(7000)      # 쇼피파이 픽셀은 늦게 뜬다(dm-track 는 최대 3초 기다림)
                    inpage = page.evaluate("window.__fbHits||[]")
                    state = page.evaluate("(()=>{try{var s=fbq.getState();return s.pixels.map(p=>p.id+':'+p.eventCount+':'+(p.agent||''))}catch(e){return null}})()")
                    err = ''
                    break
                except Exception as e:
                    err = str(e)[:80]
            ctx.remove_listener('request', on_req)
            page.close()
            for x in inpage:
                pid, _, ev = x.partition(' ')
                hits.append((pid, ev))
            # 같은 이벤트가 바깥(네트워크)·안(가로채기)에서 두 번 잡힐 수 있다 → 요청 단위로 보지 말고 큰 쪽
            pv_net = sum(1 for pid, ev in hits[:len(hits) - len(inpage)] if pid == PIXEL and ev == 'PageView')
            pv_in = sum(1 for x in inpage if x == PIXEL + ' PageView')
            pv = max(pv_net, pv_in)
            ids_state = sorted({x.split(':')[0] for x in (state or [])})
            if pv == 0 and state and ids_state == [PIXEL] and int(state[0].split(':')[1]) > 0:
                pv = 1   # 전송 방식이 안 잡혀도 픽셀이 우리 ID 하나로 이벤트를 보냈으면 정상(진짜 크롬 대조로 확인한 방식)
            others = sorted({pid for pid, ev in hits if pid not in (PIXEL, '?')} | {i for i in ids_state if i != PIXEL})
            ok = status == 200 and pv == 1 and not others and not err
            why = []
            if status != 200: why.append(f'HTTP {status}')
            if err: why.append('열기 실패')
            if pv == 0: why.append('PageView 0')
            if pv > 1: why.append(f'PageView {pv}번(중복)')
            if others: why.append('다른 픽셀 ' + ','.join(others))
            short = u.replace(SHOP, '').replace('https://darimati.github.io/inventory-dashboard/', 'github.io/') or '/'
            evs = sorted({ev for pid, ev in hits if pid == PIXEL})
            rows.append(f"| {'✅' if ok else '🔴'} | {short} | {status} | {pv} | {', '.join(evs)[:60]} {(state or [''])[0]} | {' · '.join(why)} |")
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
