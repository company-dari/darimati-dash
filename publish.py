#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""로컬 대시보드를 폰에서 열 수 있는 웹페이지로 배포한다.

로컬 대시보드는 맥 안에서만 도는 페이지(localhost)라 폰에서 안 열린다.
그래서 여기서 셋을 한다:

  1. 데이터를 HTML 안에 박아 넣어 '파일 하나로 도는' 페이지를 만든다
  2. 광고비·매출이 담긴 페이지는 PIN으로 **암호화**한다
     (AES-256-GCM + PBKDF2-SHA256 200k. PIN 없이는 복호화 불가)
  3. GitHub Pages로 올린다 → https://company-dari.github.io/darimati-dash/

PIN은 pin.txt(=.gitignore)에서 읽는다. 허브와 같은 PIN을 쓴다.
"""
import base64
import io
import json
import os
import re
import subprocess
import sys
from datetime import datetime

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

HERE = os.path.dirname(os.path.abspath(__file__))
HOME = os.path.expanduser("~")
ITERATIONS = 200_000

def pin() -> str:
    p = os.environ.get("HUB_PIN", "").strip()
    if p:
        return p
    try:
        with io.open(os.path.join(HERE, "pin.txt"), encoding="utf-8") as f:
            return f.read().strip()
    except IOError:
        sys.exit("PIN이 없습니다. pin.txt를 만드세요.")

def encrypt(plaintext: str, password: str) -> dict:
    salt = os.urandom(16)
    nonce = os.urandom(12)
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32,
                     salt=salt, iterations=ITERATIONS).derive(password.encode())
    ct = AESGCM(key).encrypt(nonce, plaintext.encode("utf-8"), None)
    b64 = lambda b: base64.b64encode(b).decode("ascii")
    return {"salt": b64(salt), "iv": b64(nonce), "ct": b64(ct), "iter": ITERATIONS}

# ─────────────────────────────────────────────────────────────
# 잠금 페이지 — 암호화된 대시보드를 감싸는 껍데기
GATE = """<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>__TITLE__</title>
<meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="#0e1013">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>__ICON__</text></svg>">
<style>
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{background:#0e1013;color:#e9ecf1;display:grid;place-items:center;padding:24px;
  font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",system-ui,sans-serif}
.box{width:100%;max-width:320px;text-align:center}
h1{font-size:19px;margin:0 0 6px;letter-spacing:-.02em}
p{color:#98a0ad;font-size:13.5px;margin:0 0 20px;line-height:1.55}
input{width:100%;padding:13px 15px;font-size:16px;border:1px solid #262b33;border-radius:12px;
  background:#171a1f;color:#e9ecf1;outline:none;text-align:center;letter-spacing:.1em}
input:focus{border-color:#6b7280}
button{width:100%;margin-top:10px;padding:13px;font-size:15px;font-weight:650;font-family:inherit;
  border:0;border-radius:12px;background:#e9ecf1;color:#14161a;cursor:pointer}
button:disabled{opacity:.5}
.err{color:#f87171;font-size:13px;margin-top:12px;min-height:18px}
.stamp{color:#6b727d;font-size:11.5px;margin-top:18px}
</style>
</head>
<body>
<div class="box">
  <h1>__TITLE__</h1>
  <p>내부 자료입니다. PIN을 넣어주세요.</p>
  <input id="pin" type="password" inputmode="text" placeholder="PIN" autocomplete="current-password" autofocus>
  <button id="go">열기</button>
  <div class="err" id="err"></div>
  <div class="stamp">데이터 기준 __STAMP__</div>
</div>
<script>
const PAYLOAD = __PAYLOAD__;
const KEYNAME = 'darimati_dash_pin';
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function open_(pin){
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    {name:'PBKDF2', salt:b64(PAYLOAD.salt), iterations:PAYLOAD.iter, hash:'SHA-256'},
    km, {name:'AES-GCM', length:256}, false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({name:'AES-GCM', iv:b64(PAYLOAD.iv)}, key, b64(PAYLOAD.ct));
  const html = new TextDecoder().decode(pt);
  localStorage.setItem(KEYNAME, pin);
  document.open(); document.write(html); document.close();
}

const err = document.getElementById('err');
const inp = document.getElementById('pin');
const btn = document.getElementById('go');

async function tryPin(pin, silent){
  if(!pin) return;
  btn.disabled = true; err.textContent = silent ? '' : '여는 중…';
  try { await open_(pin); }
  catch(e){
    btn.disabled = false;
    if(silent){ localStorage.removeItem(KEYNAME); err.textContent = ''; }
    else { err.textContent = 'PIN이 맞지 않아요.'; inp.value = ''; inp.focus(); }
  }
}
btn.addEventListener('click', () => tryPin(inp.value.trim(), false));
inp.addEventListener('keydown', e => { if(e.key === 'Enter') tryPin(inp.value.trim(), false); });

/* 이 기기에서 이미 한 번 열었으면 자동으로 */
const saved = localStorage.getItem(KEYNAME);
if(saved) tryPin(saved, true);
</script>
</body>
</html>
"""

# ─────────────────────────────────────────────────────────────
# 공유 버튼 — 대시보드를 보다가 그 자리에서 링크를 복사해 남에게 보낼 수 있게.
SHARE = """
<style>
#dm-share{position:fixed;right:14px;bottom:14px;bottom:calc(14px + env(safe-area-inset-bottom));
  z-index:2147483000;display:flex;align-items:center;gap:6px;
  padding:11px 16px;border-radius:999px;border:0;cursor:pointer;
  background:#14161a;color:#fff;font-size:13.5px;font-weight:650;
  font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",system-ui,sans-serif;
  box-shadow:0 4px 16px rgba(0,0,0,.28);-webkit-tap-highlight-color:transparent}
#dm-share:active{transform:scale(.96)}
#dm-toast{position:fixed;left:50%;bottom:74px;transform:translateX(-50%) translateY(14px);
  z-index:2147483000;max-width:min(88vw,340px);text-align:center;
  background:#14161a;color:#fff;padding:12px 18px;border-radius:14px;
  font-size:13px;line-height:1.5;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",system-ui,sans-serif;
  opacity:0;pointer-events:none;transition:.22s;box-shadow:0 6px 24px rgba(0,0,0,.3)}
#dm-toast.on{opacity:1;transform:translateX(-50%) translateY(0)}
@media print{#dm-share,#dm-toast{display:none}}
</style>
<button id="dm-share">🔗 링크 복사</button>
<div id="dm-toast"></div>
<script>
(function(){
  var btn = document.getElementById('dm-share'), t = document.getElementById('dm-toast'), timer;
  function toast(msg){
    t.innerHTML = msg; t.classList.add('on');
    clearTimeout(timer); timer = setTimeout(function(){ t.classList.remove('on'); }, 3200);
  }
  btn.addEventListener('click', async function(){
    var url = location.href.split('#')[0];
    /* 폰이면 카톡·메시지로 바로 보내기, 안 되면 클립보드 복사 */
    if(navigator.share && /iPhone|iPad|Android/i.test(navigator.userAgent)){
      try { await navigator.share({title: document.title, url: url}); return; } catch(e){ if(e.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast(__NOTE__);
    } catch(e){
      toast('복사가 막혔어요. 주소창을 길게 눌러 복사해주세요.');
    }
  });
})();
</script>
"""

def with_share(html, locked):
    note = ('링크를 복사했어요.<br><b>받는 분도 PIN이 필요합니다.</b>'
            if locked else '링크를 복사했어요.')
    block = SHARE.replace("__NOTE__", json.dumps(note, ensure_ascii=False))
    if "</body>" in html:
        return html.replace("</body>", block + "</body>", 1)
    return html + block

def gate_page(title, icon, inner_html, stamp, password):
    payload = encrypt(inner_html, password)
    return (GATE.replace("__PAYLOAD__", json.dumps(payload))
                .replace("__TITLE__", title)
                .replace("__ICON__", icon)
                .replace("__STAMP__", stamp))

# ─────────────────────────────────────────────────────────────
def read(path):
    with io.open(path, encoding="utf-8") as f:
        return f.read()

def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with io.open(path, "w", encoding="utf-8") as f:
        f.write(text)

def build_ads(password):
    """광고 대시보드 — dashboard.html + data.js 를 한 파일로 합쳐 암호화."""
    src = os.path.join(HOME, "fb-ads-dashboard")
    html = read(os.path.join(src, "dashboard.html"))
    data = read(os.path.join(src, "data.js"))

    # 외부 data.js 참조를 파일 내용으로 치환 → 파일 하나로 돌게
    html = html.replace('<script src="data.js"></script>',
                        "<script>\n%s\n</script>" % data)
    # 로컬 서버에서만 되는 탭 이동(log.html 등)은 폰에서 깨지므로 표시만 남김
    html = html.replace('href="log.html"', 'href="#" onclick="alert(\'광고 일지는 맥에서만 쓸 수 있어요\');return false"')
    html = html.replace('href="utm-builder.html"', 'href="../utm/"')

    m = re.search(r'"updated":\s*"([^"]+)"', data)
    stamp = m.group(1) if m else "-"
    write(os.path.join(HERE, "ads", "index.html"),
          gate_page("메타 광고 대시보드", "📊", with_share(html, True), stamp, password))
    return stamp

def build_growth(password):
    """Growth 대시보드 — naver-growth가 만든 자립형 스냅샷을 암호화."""
    src = os.path.join(HOME, "naver-growth", "dist", "darimati-growth.html")
    if not os.path.exists(src):
        print("  ! growth: dist/darimati-growth.html 없음 — 건너뜀 (naver-growth에서 publish.py 먼저)")
        return None
    html = read(src)
    stamp = datetime.fromtimestamp(os.path.getmtime(src)).strftime("%Y.%m.%d %H:%M")
    write(os.path.join(HERE, "growth", "index.html"),
          gate_page("네이버 Growth 대시보드", "📈", with_share(html, True), stamp, password))
    return stamp

def build_utm():
    """UTM 생성기 — 데이터가 없는 순수 도구라 잠그지 않는다."""
    src = os.path.join(HOME, "fb-ads-dashboard", "utm-builder.html")
    html = read(src)
    if "viewport" not in html:
        html = html.replace("<head>", '<head>\n<meta name="viewport" content="width=device-width,initial-scale=1">', 1)
    html = html.replace("</head>", '<meta name="robots" content="noindex,nofollow">\n</head>', 1)
    html = html.replace('href="dashboard.html"', 'href="../ads/"')
    html = html.replace('href="log.html"', 'href="#" onclick="alert(\'광고 일지는 맥에서만 쓸 수 있어요\');return false"')
    write(os.path.join(HERE, "utm", "index.html"), with_share(html, False))

INDEX = """<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>다리마티 대시보드</title><meta name="robots" content="noindex,nofollow">
<style>
body{margin:0;background:#0e1013;color:#e9ecf1;padding:28px 20px;
 font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",system-ui,sans-serif}
.w{max-width:520px;margin:0 auto}h1{font-size:20px;margin:0 0 4px}
p{color:#98a0ad;font-size:13.5px;margin:0 0 22px}
a{display:block;padding:16px 18px;margin-bottom:10px;background:#171a1f;border:1px solid #262b33;
 border-radius:14px;color:#e9ecf1;text-decoration:none;font-weight:650;font-size:15.5px}
a span{display:block;font-weight:400;font-size:12.5px;color:#98a0ad;margin-top:4px}
</style></head><body><div class="w">
<h1>다리마티 대시보드</h1><p>폰에서 보는 읽기 전용 스냅샷</p>
<a href="ads/">📊 메타 광고 대시보드<span>광고비·노출·클릭·CPC · PIN 필요</span></a>
<a href="growth/">📈 네이버 Growth 대시보드<span>매출·유입·검색어·퍼널 · PIN 필요</span></a>
<a href="talent/">👥 인물 관리<span>선수·크리에이터·파트너·코치 · 대시보드에서 직접 수정 · PIN 필요</span></a>
<a href="f45/">🗺️ F45 지점 관리<span>공략 지도·협의현황·지점별 판매링크/QR·할인코드·신청접수 · PIN 필요</span></a>
<a href="utm/">🔗 UTM·광고명 생성기<span>바로 사용</span></a>
</div></body></html>
"""

def main():
    pw = pin()
    print("빌드 중…")
    a = build_ads(pw);      print("  ads    :", a)
    g = build_growth(pw);   print("  growth :", g)
    build_utm();            print("  utm    : ok")
    write(os.path.join(HERE, "index.html"), INDEX)

    if "--no-push" in sys.argv:
        return
    subprocess.run(["git", "add", "-A"], cwd=HERE, check=True)
    st = subprocess.run(["git", "status", "--porcelain"], cwd=HERE,
                        capture_output=True, text=True).stdout.strip()
    if not st:
        print("바뀐 내용 없음 — 배포 생략")
        return
    msg = "대시보드 갱신 %s" % datetime.now().strftime("%Y-%m-%d %H:%M")
    subprocess.run(["git", "-c", "user.name=company-dari",
                    "-c", "user.email=company@darimati.us",
                    "commit", "-q", "-m", msg], cwd=HERE, check=True)
    subprocess.run(["git", "push", "-q", "origin", "main"], cwd=HERE, check=True)
    print("배포 완료 → https://company-dari.github.io/darimati-dash/")

if __name__ == "__main__":
    main()
