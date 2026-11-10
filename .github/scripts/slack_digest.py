"""감시 알림 묶기 (2026-11-10 사장님 「알림 무한 반복 줄여」).

같은 문제를 매일 11줄씩 다시 보내면 새 고장이 묻힌다. 그래서:
- 새로 생긴 문제 → 바로 자세히
- 어제도 있던 문제 → 「계속 중 N건」 한 줄 (월요일엔 전체 목록 다시)
- 같은 종류(외국어 9개 등)는 한 줄로 묶기
- 어제 보낸 목록은 actions/cache 의 /tmp/wd-state/sent.json (맥과 무관)
안전장치: 기억 파일을 못 읽으면 전부 「새 문제」로 보낸다(알림이 빠지는 쪽으로는 안 고장남).
슬랙 전송이 실패하면 기억을 갱신하지 않는다 → 다음 날 다시 보낸다.

입력(env): BODY(번호 붙은 문제 줄들) HINT RUN_URL SLACK_WEBHOOK ALARM_TEST
"""
import datetime as dt, json, os, re, sys, urllib.request

STATE = '/tmp/wd-state/sent.json'
KST = dt.timezone(dt.timedelta(hours=9))
now = dt.datetime.now(KST)
today = now.date().isoformat()

lines = [re.sub(r'^\d+\.\s*', '', l).strip() for l in os.environ.get('BODY', '').splitlines() if l.strip()]

# 같은 종류 묶기: 「EN 화면 상품 정보에 한글이 남았습니다: a, b」 × 9개 언어 → 한 줄
LEAK = re.compile(r'^(\S+) 화면 상품 정보에 한글이 남았습니다: (.+)$')
langs, handles, items = [], [], []
for l in lines:
    m = LEAK.match(l)
    if m:
        langs.append(m.group(1))
        for h in m.group(2).split(', '):
            if h not in handles: handles.append(h)
    else:
        items.append(l)
if langs:
    items.append(f'외국어 화면 상품 정보에 한글 남음 ({len(langs)}개 언어: {"·".join(langs)}): {", ".join(handles)}')

def key(s):  # 「84일」「3건」처럼 매일 바뀌는 숫자는 같은 문제로 본다
    return re.sub(r'\d+', '#', re.sub(r'\([^)]*\)', '', s))  # 괄호 안(언어 목록 등)도 무시

try:
    seen = json.load(open(STATE))
except Exception:
    seen = {}

cur = {key(i): i for i in items}
always_new = lambda i: i.startswith('0. ') or '감시 검사 자체가' in i or '경보 시험' in i
new = [i for k, i in cur.items() if k not in seen or always_new(i)]
old = [i for k, i in cur.items() if k in seen and not always_new(i)]
fixed = [seen[k]['text'] for k in seen if k not in cur]
monday = now.weekday() == 0

def days(i):
    return (now.date() - dt.date.fromisoformat(seen[key(i)]['since'])).days + 1

out = []
if new:
    out += ['*새로 생긴 문제*'] + [f'{n}. {i}' for n, i in enumerate(new, 1)]
if old:
    if monday:
        out += ['', '*계속 중인 문제 (월요일 전체 목록)*'] + [f'• {i}  _({days(i)}일째)_' for i in old]
    else:
        out += ['', f'계속 중 {len(old)}건 (가장 오래된 것 {max(days(i) for i in old)}일째) — 월요일에 전체 목록']
if fixed and out:
    out += ['', '✅ 해결됨: ' + ' / '.join(f[:40] for f in fixed[:5])]

send = bool(new) or (monday and bool(old))
if not send:
    print(f'새 문제 없음(계속 중 {len(old)}건) — 오늘은 슬랙 안 보냄')
else:
    title = '🔴 *다리마티 시스템 감시 — 새 문제*' if new else '🟠 *다리마티 시스템 감시 — 월요일 계속 중 목록*'
    text = f"{title} ({now:%m/%d %H:%M} KST)\n" + '\n'.join(out) + os.environ.get('HINT', '') + f"\n자세히: {os.environ.get('RUN_URL', '')}"
    hook = os.environ.get('SLACK_WEBHOOK')
    if not hook:
        print(text); print('SLACK_WEBHOOK 없음 — 출력만(시험)')
    else:
      try:
        urllib.request.urlopen(urllib.request.Request(hook, json.dumps({'text': text}).encode(),
                                                      {'Content-Type': 'application/json'}), timeout=20)
        print('슬랙 보냄:\n' + text)
      except Exception as e:
        print(f'🔴 슬랙 전송 실패 — 기억 갱신 안 함(내일 다시 보냄): {e}'); sys.exit(1)

# 기억 갱신: 지금 있는 문제만 남긴다(해결된 건 빠짐). 처음 본 날은 유지
os.makedirs(os.path.dirname(STATE), exist_ok=True)
json.dump({k: {'text': i, 'since': (seen.get(k) or {}).get('since', today)} for k, i in cur.items()
           if not always_new(i)}, open(STATE, 'w'), ensure_ascii=False, indent=1)
