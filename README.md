# 다리마티 대시보드 (폰용)

맥에서만 돌던 로컬 대시보드를 폰에서 볼 수 있게 올려두는 곳.

**라이브**: https://company-dari.github.io/darimati-dash/

| 페이지 | 내용 | 잠금 |
|---|---|---|
| `/ads/` | 메타 광고 대시보드 (광고비·노출·클릭·CPC) | 🔒 PIN |
| `/growth/` | 네이버 Growth 대시보드 (매출·유입·검색어·퍼널) | 🔒 PIN |
| `/utm/` | UTM·광고명 생성기 | 없음 (데이터 없는 도구) |
| `/qr/` | QR 관리 (생성·목적지 교체·스캔 집계) | 🔒 암호 (앱스스크립트) |
| `/q/` | QR이 가리키는 고정 주소 → 목적지로 넘김 | 없음 (손님이 여는 곳) |

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

## QR — 인쇄물이 죽지 않게

인쇄한 QR은 되돌릴 수 없다. 그래서 QR에는 **목적지를 넣지 않고** 우리 고정 주소만 넣는다.

```
[인쇄된 QR] → /q/?c=join → (구글시트 링크표를 읽어) → 지금의 목적지
```

목적지를 바꾸려면 `/qr/`에서 한 줄 고치면 끝이고, 이미 뿌린 전단지는 그대로 산다.

- **링크표·스캔기록**: 구글시트 + `qr/Code.gs`(앱스스크립트 웹앱). 시트 두 장(`링크`/`스캔`)은 자동 생성.
- **접속정보**: `qr/api.txt`(=.gitignore) 두 줄 — 1행 `…/exec` 주소, 2행 암호.
- **비상 스냅샷**: 배포 때마다 `qr/snapshot.py`가 링크표를 `q/links.js`로 구워 둔다.
  구글이 느리거나 죽어도 인쇄된 QR이 목적지에 닿는다. 중지된 QR은 스냅샷에서 빠진다.
- 손님이 QR을 찍을 때 부르는 요청(`a=go`)만 암호가 없다. 나머지는 전부 암호가 필요하다.
- QR 인코더는 `qr/qrcode.js`(셔틀런과 동일). 규격 해독 + RS 신드롬 검사로 검증했다(2026-07-29).

## 데이터 출처

- 광고: `~/fb-ads-dashboard/` (fetch.py → data.js, 메타 마케팅 API)
- Growth: `~/naver-growth/dist/darimati-growth.html` (build.py → publish.py가 만든 자립형 스냅샷)
- UTM: `~/fb-ads-dashboard/utm-builder.html`

## 여기 없는 것

**발주 취합 대시보드**는 고객 이름·전화번호·주소가 들어 있어 올리지 않는다.
맥에서만 연다(`open ~/sales-order-sync/index.html`).
