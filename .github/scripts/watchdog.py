#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
다리마티 시스템 감시 — 깃허브 클라우드에서 매일 도는 점검.

맥북과 무관하게 돌아서, 맥이 꺼져 있어도 "무엇이 멈췄는지" 알 수 있다.
문제를 발견하면 종료코드 1 로 끝나고, 워크플로가 깃허브 이슈로 알린다.

⚠️ 여기서 확인하는 것은 전부 **바깥에서 보이는 사실**이다.
   맥 안의 상태를 못 보므로, "결과가 최신인가"로 판단한다.
"""
import json
import os
import ssl
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))
TODAY = datetime.now(KST).strftime('%Y.%m.%d')
CTX = ssl.create_default_context()

DASH = 'https://company-dari.github.io/darimati-dash'
LANDINGS = ['index.html', 's1-landing.html', 's1-landing-kr.html', 's2-landing.html',
            's2-landing-white.html', 'br001-shop.html', 'product-br001.html']

problems = []   # 사람이 읽을 문제 목록
lines = []      # 리포트 본문


def say(s=''):
    lines.append(s)
    print(s)


def get(url, timeout=25):
    """페이지를 받아 문자열로. 실패하면 None."""
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'darimati-watchdog',
            'Cache-Control': 'no-cache',
        })
        with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
            return r.read().decode('utf-8', 'replace')
    except Exception:
        return None


def status(url, timeout=25):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'darimati-watchdog'})
        with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:
        return 0


# ── ① 대시보드가 오늘 갱신됐나 ────────────────────────────────────────
#    맥이 자면 이 값이 어제(또는 그 전)에 멈춘다. 6일 멈춘 사고의 탐지 지점.
say('## ① 대시보드 신선도')
html = get(f'{DASH}/br001/?wd={datetime.now(KST).timestamp()}')
if html is None:
    problems.append('BR-001 대시보드 페이지를 열 수 없음')
    say('- 🔴 BR-001 대시보드: **접속 실패**')
else:
    import re
    stamps = re.findall(r'20\d\d[.\-]\d\d[.\-]\d\d', html)
    latest = max(stamps).replace('-', '.') if stamps else None
    if not latest:
        problems.append('BR-001 대시보드에서 기준일을 못 찾음')
        say('- ⚠️ BR-001 대시보드: 기준일 표기를 찾지 못함')
    else:
        d = datetime.strptime(latest, '%Y.%m.%d').replace(tzinfo=KST)
        days = (datetime.now(KST) - d).days
        if days <= 1:
            say(f'- ✅ BR-001 대시보드: `{latest}` ({days}일 전)')
        else:
            problems.append(f'BR-001 대시보드가 {days}일째 갱신 안 됨 (기준일 {latest}) '
                            f'— 맥이 잠들었거나 자동화가 죽었을 가능성')
            say(f'- 🔴 BR-001 대시보드: `{latest}` — **{days}일 묵음**')

# ── ② 라이브 페이지에 픽셀이 살아있나 ────────────────────────────────
#    다른 에이전트가 페이지를 다시 만들면 픽셀 블록이 통째로 날아간다.
say('')
say('## ② 픽셀 생존')
bridge = get('https://www.darimati.us/pages/br001-preview')
if bridge is None:
    problems.append('브릿지 랜딩 접속 실패')
    say('- 🔴 브릿지 랜딩: **접속 실패**')
else:
    need = {'픽셀ID': '821311187492862', 'DeepView': "'DeepView'",
            'NaverClickout': 'NaverClickout', '중복방지': 'eventID:'}
    miss = [k for k, v in need.items() if v not in bridge]
    if miss:
        problems.append('브릿지 랜딩에서 사라진 것: ' + ', '.join(miss))
        say(f'- 🔴 브릿지 랜딩: **{", ".join(miss)} 없음**')
    else:
        say('- ✅ 브릿지 랜딩: 픽셀·DeepView·NaverClickout·중복방지 전부 정상')

alive = 0
for p in LANDINGS:
    h = get(f'https://darimati.github.io/inventory-dashboard/{p}')
    if h and h.count('fbq(') >= 6:
        alive += 1
if alive == len(LANDINGS):
    say(f'- ✅ 영문 랜딩: {alive}/{len(LANDINGS)}')
else:
    problems.append(f'영문 랜딩 픽셀이 {len(LANDINGS)-alive}개 페이지에서 사라짐 '
                    f'({alive}/{len(LANDINGS)}) — 다른 에이전트가 덮어썼을 가능성')
    say(f'- 🔴 영문 랜딩: **{alive}/{len(LANDINGS)}**')

# ── ③ 구매 링크 ──────────────────────────────────────────────────────
#    깨지면 광고비가 그대로 샌다. 가장 비싼 고장.
say('')
say('## ③ 구매 링크')
for u in ['https://www.darimati.us',
          'https://www.darimati.us/cart',
          'https://www.darimati.us/products/bridge-001']:
    c = status(u)
    if c == 200:
        say(f'- ✅ `{u.replace("https://www.", "")}` {c}')
    else:
        problems.append(f'구매 경로 응답 이상: {u} → {c}')
        say(f'- 🔴 `{u.replace("https://www.", "")}` **{c}**')

# ── ④ 메타 토큰 ──────────────────────────────────────────────────────
#    죽으면 전환 API(서버 전송)와 광고 대시보드가 동시에 멈춘다.
say('')
say('## ④ 메타 토큰')
tok = os.environ.get('META_ACCESS_TOKEN', '')
if not tok:
    say('- ⚪ 토큰이 설정돼 있지 않아 건너뜀 (저장소 Secrets 에 `META_ACCESS_TOKEN` 추가 시 확인)')
else:
    q = urllib.parse.urlencode({'input_token': tok, 'access_token': tok})
    raw = get(f'https://graph.facebook.com/v21.0/debug_token?{q}')
    try:
        d = json.loads(raw).get('data', {})
    except Exception:
        d = {}
    if d.get('is_valid'):
        exp = d.get('expires_at', 0)
        say('- ✅ 토큰 유효 · ' + ('만료 없음' if exp == 0 else
            '만료 ' + datetime.fromtimestamp(exp, KST).strftime('%Y-%m-%d')))
        if exp and exp - datetime.now(KST).timestamp() < 14 * 86400:
            problems.append('메타 토큰이 2주 안에 만료됨 — 재발급 필요')
            say('- 🔴 **2주 안에 만료된다 → 재발급 필요**')
    else:
        problems.append('메타 토큰이 무효 — 전환 API와 광고 대시보드가 동시에 멈춘다')
        say('- 🔴 **토큰 무효**')

# ── ⑤ 공동구매 파트너 대시보드 ───────────────────────────────────────
#    파트너(꾸노핑 등)가 직접 보는 화면이다. 멈추면 우리보다 파트너가 먼저 안다.
#    NCP 서버 cron(매시 10분)이 죽으면 숫자가 그대로 얼어붙는다.
say('')
say('## ⑤ 공동구매 대시보드')
GROUPBUY = 'https://company-dari.github.io/groupbuy-live'
# 토큰은 저장소에 두지 않는다(공개 저장소). Secrets 에 쉼표로 넣는다.
gb_tokens = [t.strip() for t in os.environ.get('GROUPBUY_TOKENS', '').split(',') if t.strip()]
if not gb_tokens:
    say('- ⚪ 토큰이 없어 건너뜀 (저장소 Secrets 에 `GROUPBUY_TOKENS` 추가 시 확인)')
elif status(f'{GROUPBUY}/') != 200:
    problems.append('공동구매 대시보드 페이지 접속 실패')
    say('- 🔴 페이지 **접속 실패**')
else:
    for t in gb_tokens:
        raw = get(f'{GROUPBUY}/data/{t}.json?wd={datetime.now(KST).timestamp()}')
        try:
            d = json.loads(raw)
        except Exception:
            problems.append(f'공동구매 데이터를 읽을 수 없음 (토큰 …{t[-4:]})')
            say(f'- 🔴 `…{t[-4:]}`: **데이터 없음**')
            continue
        who = d.get('partner', '?')
        stamp = d.get('updatedAt', '')
        try:
            upd = datetime.strptime(stamp, '%Y-%m-%d %H:%M').replace(tzinfo=KST)
        except Exception:
            problems.append(f'{who} 대시보드에 기준 시각이 없음')
            say(f'- 🔴 {who}: **기준 시각 없음**')
            continue
        hours = (datetime.now(KST) - upd).total_seconds() / 3600
        s = d.get('summary', {})
        # 매시 도니까 6시간이면 최소 5번을 연달아 건너뛴 것 = 확실한 고장
        if hours > 6:
            problems.append(f'{who} 공동구매 대시보드가 {hours:.0f}시간째 멈춤 '
                            f'(기준 {stamp}) — NCP 서버 cron 또는 배포키 확인')
            say(f'- 🔴 {who}: `{stamp}` — **{hours:.0f}시간 묵음**')
        else:
            say(f'- ✅ {who}: `{stamp}` ({hours:.1f}시간 전) · '
                f'{s.get("count", 0)}건 {s.get("revenue", 0):,}원')

# ── 경보 시험 ────────────────────────────────────────────────────────
#    "울리지 않는 경보기"가 아닌지 확인하려고 일부러 실패시키는 스위치.
#    Actions 탭에서 alarm_test 를 켜고 실행하면 이슈가 만들어져야 한다.
if os.environ.get('ALARM_TEST', '').lower() == 'true':
    problems.append('🧪 **경보 시험입니다 — 진짜 고장이 아닙니다.** '
                    '이 이슈가 보인다면 알림 경로가 정상이라는 뜻입니다. 닫으셔도 됩니다.')
    say('')
    say('> 🧪 경보 시험 모드로 실행됨')

# ── 총평 ─────────────────────────────────────────────────────────────
say('')
say('---')
if problems:
    say(f'## 🔴 문제 {len(problems)}건')
    for i, p in enumerate(problems, 1):
        say(f'{i}. {p}')
    say('')
    say('맥에서 `morning-check` 를 실행하면 더 자세히 볼 수 있습니다.')
    sys.exit(1)

say('## ✅ 이상 없음')
sys.exit(0)
