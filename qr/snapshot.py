#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""구글시트의 링크표를 읽어 q/links.js 로 구워 넣는다.

인쇄된 QR은 되돌릴 수 없으므로, 구글 쪽이 잠깐 느리거나 죽는 순간에도
손님이 목적지에 닿아야 한다. 그 마지막 보루가 이 스냅샷 파일이다.
평소에는 쓰이지 않고, 실시간 조회가 실패했을 때만 동작한다.

접속 정보는 qr/api.txt(=.gitignore) 에서 읽는다. 두 줄이면 된다.

    https://script.google.com/macros/s/AKfy.../exec
    dari1!

publish.py 가 배포할 때마다 자동으로 부른다. 혼자 돌려도 된다.
"""
import hashlib
import io
import json
import os
import re
import sys
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "q", "links.js")
INDEX = os.path.join(os.path.dirname(HERE), "q", "index.html")
TIMEOUT = 20

HEAD = """/* 배포할 때 자동으로 다시 구워지는 파일 — 손으로 고칠 필요 없습니다.
   (qr/snapshot.py 가 구글시트를 읽어서 여기에 덮어씁니다)

   왜 있냐면: 구글이 잠깐 느리거나 죽어도 인쇄된 QR이 살아 있어야 하기 때문입니다.
   평소에는 안 쓰이고, 실시간 조회가 실패한 순간에만 이 값이 손님을 구합니다. */
"""



def stamp_index(body):
    """q/index.html 의 <script src="links.js"> 에 내용 지문(v=)을 박는다.

    왜 필요하냐면: 이 태그에 버전이 없으면 브라우저가 옛 links.js 를 계속
    붙들고 있는다. 그러면 목적지를 바꿔도 그 손님만 옛 주소로 간다.
    실제로 2026-08-03(F45 QR 3개)·2026-08-27(런공덕·크로스핏) 두 번 겪었다.
    지문은 내용에서 나오므로, 링크표가 안 바뀌면 주소도 안 바뀐다(캐시 유지).
    """
    v = hashlib.sha1(body.encode("utf-8")).hexdigest()[:10]
    try:
        with io.open(INDEX, encoding="utf-8") as f:
            html = f.read()
    except IOError:
        return None
    new = re.sub(r'<script src="links\.js(?:\?v=[0-9a-f]+)?"></script>',
                 '<script src="links.js?v=%s"></script>' % v, html, count=1)
    if new != html:
        with io.open(INDEX, "w", encoding="utf-8") as f:
            f.write(new)
    return v


def creds():
    """(exec URL, KEY) 를 돌려준다. 없으면 None."""
    path = os.path.join(HERE, "api.txt")
    try:
        with io.open(path, encoding="utf-8") as f:
            lines = [x.strip() for x in f if x.strip()]
    except IOError:
        return None
    if len(lines) < 2:
        return None
    return lines[0], lines[1]


def fetch(url, key):
    q = urllib.parse.urlencode({"a": "list", "key": key})
    sep = "&" if "?" in url else "?"
    with urllib.request.urlopen(url + sep + q, timeout=TIMEOUT) as r:
        return json.loads(r.read().decode("utf-8"))


def build():
    c = creds()
    if not c:
        return "api.txt 없음 — 건너뜀"
    url, key = c

    try:
        data = fetch(url, key)
    except Exception as e:
        return "구글 응답 없음(%s) — 이전 스냅샷 유지" % type(e).__name__

    if not data.get("ok"):
        return "거절됨(%s) — 이전 스냅샷 유지" % data.get("error", "?")

    # 중지된 QR은 스냅샷에서 뺀다. 꺼둔 링크가 비상시에 되살아나면 안 되므로.
    m = {
        x["code"]: x["url"]
        for x in data.get("links", [])
        if x.get("url") and x.get("active")
    }

    body = "window.QR = {\n  api: %s,\n  map: %s\n};\n" % (
        json.dumps(url, ensure_ascii=False),
        json.dumps(m, ensure_ascii=False, indent=4).replace("\n}", "\n  }"),
    )
    with io.open(OUT, "w", encoding="utf-8") as f:
        f.write(HEAD + body)
    v = stamp_index(body)
    return "QR %d개 구움 (지문 v=%s)" % (len(m), v or "미표기")


if __name__ == "__main__":
    print(build())
