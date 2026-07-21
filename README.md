# 다리마티 대시보드 (폰용)

맥에서만 돌던 로컬 대시보드를 폰에서 볼 수 있게 올려두는 곳.

**라이브**: https://company-dari.github.io/darimati-dash/

| 페이지 | 내용 | 잠금 |
|---|---|---|
| `/ads/` | 메타 광고 대시보드 (광고비·노출·클릭·CPC) | 🔒 PIN |
| `/growth/` | 네이버 Growth 대시보드 (매출·유입·검색어·퍼널) | 🔒 PIN |
| `/utm/` | UTM·광고명 생성기 | 없음 (데이터 없는 도구) |

## 어떻게 도는가

`publish.py` 하나가 전부 한다.

1. 로컬 대시보드의 HTML과 데이터를 **한 파일로 합친다** (외부 요청 없이 열리게)
2. 광고비·매출이 담긴 페이지는 **AES-256-GCM + PBKDF2-SHA256(20만 회)** 로 암호화한다
3. PIN 입력 화면만 평문으로 남기고 GitHub Pages에 올린다

이 repo는 public이지만 **PIN 없이는 내용을 복호화할 수 없다.** 브라우저 WebCrypto로 풀기 때문에
https(또는 localhost)에서만 동작한다. 한 번 연 기기는 PIN을 기억해 다음부터 바로 열린다.

PIN은 `pin.txt`(=.gitignore)에서 읽는다. 허브와 같은 PIN.

## 읽기 전용이다

폰에서 보는 건 **마지막 갱신 시점의 스냅샷**이다. 기록을 남기는 기능
(광고 일지, Growth 특이사항)은 저장할 서버가 없어 맥에서만 쓴다.

## 갱신

```bash
dashpush            # 지금 바로 수집 → 빌드 → 배포
python3 publish.py --no-push   # 배포 없이 빌드만 (확인용)
```

매일 아침 **08:10 자동 실행**(launchd `us.darimati.ads-daily`)으로도 갱신된다.
맥이 꺼져 있었으면 켤 때 밀린 것이 실행된다. 로그는 `~/fb-ads-dashboard/fetch.log`.

Growth 데이터는 사용자가 Biz Advisor 엑셀을 받아 `growth` 명령을 돌릴 때 갱신되고,
그 결과가 다음 배포 때 함께 올라간다.

## 데이터 출처

- 광고: `~/fb-ads-dashboard/` (fetch.py → data.js, 메타 마케팅 API)
- Growth: `~/naver-growth/dist/darimati-growth.html` (build.py → publish.py가 만든 자립형 스냅샷)
- UTM: `~/fb-ads-dashboard/utm-builder.html`

## 여기 없는 것

**발주 취합 대시보드**는 고객 이름·전화번호·주소가 들어 있어 올리지 않는다.
맥에서만 연다(`open ~/sales-order-sync/index.html`).
