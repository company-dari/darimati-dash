#!/usr/bin/env python3
"""리뷰 AI 알림 → 슬랙 (2026-10-29) · .github/workflows/review-ai.yml 이 부른다
- PR 열림: 승인 요청(제목이 [검사 실패] 면 실패 알림) · main 반영: 반영 완료
- 매일: ① 8일 넘게 새 요약 없음(예약 실행 멈춤) ② 3일 넘게 승인 안 된 요청 재알림
웹훅 없으면 조용히 끝내지 않고 실패(exit 1) → 깃허브가 실패 메일을 보낸다"""
import json, os, sys, glob, datetime, subprocess, urllib.request

HOOK = os.environ.get("SLACK_WEBHOOK", "")
EV = os.environ.get("EVENT", "")
TODAY = datetime.date.today()


def slack(text):
    if not HOOK.startswith("https://"):
        print("SLACK_WEBHOOK 없음 — 알림을 못 보냄"); sys.exit(1)
    urllib.request.urlopen(urllib.request.Request(HOOK, data=json.dumps({"text": text}).encode(),
                                                  headers={"Content-Type": "application/json"}), timeout=20)
    print("슬랙 전송:", text.splitlines()[0])


if EV == "pull_request":
    if os.environ.get("PR_ACTION") not in ("opened", "reopened"):
        sys.exit(0)
    title, url, body = os.environ.get("PR_TITLE", ""), os.environ.get("PR_URL", ""), os.environ.get("PR_BODY", "")
    if title.startswith("[검사 실패]"):
        slack(f"❌ 리뷰 AI 주간 요약 — 검사 실패 (상세페이지는 지난 요약 유지)\n{body[:1500]}\n{url}")
    else:
        slack(f"🔎 리뷰 AI 주간 요약 — 승인 요청\n{body[:1800]}\n👉 승인 = 링크 열고 「Merge pull request」 한 번: {url}")
elif EV == "push":
    slack("✅ 리뷰 AI 요약 반영됨 — 몇 분 뒤 상세페이지(위쪽 MATI AI 후기 요약)에 보입니다")
else:  # schedule · 수동
    warn = []
    # 예약 실행은 매주 review-ai/_last-run.json 을 남긴다(리뷰 변화 없어도) → 8일 넘게 없으면 멈춘 것
    try:
        lr = json.load(open("review-ai/_last-run.json"))
        age = (TODAY - datetime.date.fromisoformat(lr.get("date", ""))).days
    except Exception:
        lr, age = {}, 999
    if age > 8:
        warn.append(f"⚠️ 리뷰 AI 주간 예약 실행이 {age}일째 기록 없음 — claude.ai/code/routines 확인 필요 (상세페이지는 지난 요약 유지)")
    if lr.get("usage_warn"):
        warn.append("⚠️ 리뷰 AI 사용량: " + lr["usage_warn"])
    try:
        prs = json.loads(subprocess.check_output(["gh", "pr", "list", "--state", "open", "--json", "title,url,createdAt"], text=True))
    except Exception as e:
        prs = []; print("PR 목록 실패", e)
    for p in prs:
        if "리뷰 AI" in p["title"]:
            d = (TODAY - datetime.date.fromisoformat(p["createdAt"][:10])).days
            if d >= 3:
                warn.append(f"⏰ 리뷰 AI 승인 요청이 {d}일째 대기: {p['url']}")
    if warn:
        slack("\n".join(warn))
    else:
        print("이상 없음")
