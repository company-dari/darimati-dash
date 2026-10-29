# 출고 대시보드 — Apps Script 원본

> **왜 여기 있나**: 2026-09-14 이 코드가 어느 저장소에도 없어서
> 「우리가 만든 건데 못 본다」 상황이 벌어졌다. 구글 계정 안에만 있었다.
> 앞으로 이 폴더가 **원본의 사본**이다. 구글에서 고치면 여기도 같이 갱신한다.

| | |
|---|---|
| 프로젝트 | **다리마티 출고 대시보드** (script.google.com → My Projects) |
| 스크립트 ID | `1w9DVpArj8LGP4kSribQm2G9BwHoPb1sSZGt2bqqhMvlm7k_zDwtcuTkL` |
| 배포 주소 | `https://script.google.com/a/macros/darimati.us/s/AKfycbwa6LNhgy6RUwzzKVbj4f7S8I9siYsE_VUsUDx1r20IYBM6FGdRMH1_wxRBLvzeLh1E4Q/exec` |
| 안내 페이지 | `../index.html` (이 웹앱 사용법 문서) |

## 파일
- `Code.gs` — 서버쪽. 재고/발주 시트를 읽고 출고완료·양품화입고를 쓴다
- `Index.html` — 화면

## 이 스크립트가 보는 구글 시트
| 상수 | 시트 | 쓰는 탭 |
|---|---|---|
| `INV_ID` `18F4Zo3t…` | 재고 | `현재재고` · `불량품` · `양품화입고` |
| `ORDER_ID` `1ibroQV4…` | 발주 | `1) 발주_취합양식` |

## 고치는 방법
1. script.google.com → My Projects → 「다리마티 출고 대시보드」
2. 코드 수정 후 **Deploy → Manage deployments → 연필 → New version → Deploy**
   (새 배포를 만들면 주소가 바뀐다. **기존 배포를 수정**해야 주소가 유지된다)
3. 고친 내용을 이 폴더에도 반영하고 커밋한다

🪤 `clasp` 는 쓰지 않는다 (PAGE-SYSTEM 892줄 — 토큰 만료·로그인 프롬프트로 막힌다)

## 2026-10-12 — 👟 VT-001 블랙 탭 (라이브 v21)
- 발주서 **BR-002_BK = VT-001 블랙** 210족. 쇼피파이 미판매라 `남음 = 생산(VT_MADE) − VT수기차감 탭`
- 재고 시트에 `VT수기차감` 탭(날짜|사이즈|수량|메모|적은사람) 자동 생성. 「쇼피파이 반영함」 없음
- 🪤 라이브는 이 폴더에서 **「현백 현장판매」 탭을 뺀 것**과 같다(그건 아직 미배포). 그래서 파일 통째 붙여넣기 금지 — 편집기에서 해당 부분만 삽입했다
- 🪤 편집기에서 함수 직접 실행(▶ Run)은 구글 권한 승인 창이 뜬다 → 데이터 입력은 웹앱 화면으로 했다

## 2026-10-29 — 🌏 해외 판매 진행판 링크 (라이브 v24)
- 탭 줄 바로 아래 버튼 한 줄: claude.ai 진행판(나라별 통화·번역) 열기. company@ 로 claude.ai 로그인된 사람만 열림
- 편집기에서 해당 한 줄만 삽입 → 기존 배포 연필 → 새 버전(주소 유지). 🪤 clasp 는 이 프로젝트 권한 없는 계정으로 로그인돼 있음(`The caller does not have permission`)
- 편집기 코드 수정은 화면 클릭 대신 페이지의 `monaco.editor.getModels()` 로 해당 줄만 넣으면 빠르고 정확하다
