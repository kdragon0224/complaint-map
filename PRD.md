# PRD — AI 민원배부 내비게이션
> Product Requirements Document (기술 레퍼런스)  
> 작성: 한국도로공사 전북본부 | 최초 작성: 2026년 6월 | 최종 수정: 2026년 8월 13일 (민자 고속도로 15개 노선 OSM 실도로 형상 교체, 이격 경고 임계값 100m 조정, 통계 총계 count 쿼리 분리, 노선명 병기 표시 추가, 관할주체 판정 우선순위를 직제 최우선으로 재정의)

---

## 1. 기술 스택

| 구분 | 기술 |
|------|------|
| 프레임워크 | Next.js 16 (App Router, TypeScript) |
| 스타일 | Tailwind CSS v4 |
| 지도 | Kakao Maps JavaScript SDK (`libraries=services`, `autoload=false` + async) |
| 주소검색 | Kakao Local REST API (주소검색 + 키워드검색 병렬 실행) |
| 행정구역 | Kakao coord2regioncode API (도로법 규칙 판정용) |
| DB | Supabase (PostgreSQL) — 오류 신고 게시판, 이용 로그 |
| 배포 | GitHub → Vercel 자동 배포 (main 브랜치 push 시 즉시 반영) |
| 도메인 | https://complaint-map.vercel.app |

---

## 2. 아키텍처: 도로 인식 ↔ 관리주체 판정 분리

```
사용자 입력 (주소 / IC·JC명 / 핀 이동)
    ↓
[지오코딩] Kakao 주소검색 + 키워드검색 병렬
  · 주소 결과 → 좌표 + 행정구역까지 응답에 포함 (별도 API 호출 생략)
  · 키워드 결과 → 고속도로 시설(IC·JC·SA) 우선 정렬
  · 주소 결과에 서로 다른 시/도가 섞여 있으면(동명 지번) 자동 선택 대신
    { ambiguous: candidates[] } 응답 → 클라이언트가 후보 목록 UI 표시 (§15)
    ↓
핀 좌표 확정
    ↓
[도로 인식 1] highway-grid.json — 고속도로 (반경 500m, 0.1도 격자)
  · 200m 이내 발견 시 OSM 탐색 생략 (성능)
    ↓
[도로 인식 2] osm-road-grid.json — 국도(n)·지방도(p)·주요간선(x)
    ↓
[관리주체 판정]
  · 고속국도: highway-jurisdiction.ts formatAgency() — 신뢰도 순 4단계 (§2-1)
      1순위 JURISDICTION_RULES(직제) → 2순위 PRIVATE_ROAD_CODES(민자)
      → 3순위 TRANSFERRED_SECTIONS(이관) → 4순위 미기재 폴백
  · 그 외: road-rules.ts (행정구역 필요 시 coord2regioncode 호출) — §2-1
      1순위 PRIVATE_LOCAL_ROADS(민자 지방도·교량, 도로명 매칭) → 없으면 OSM 등급별:
      국도: 특별·광역시 또는 시 동지역 → 해당 시 / 그 외 → 지방국토관리청
      지방도: 시 동지역 → 시 / 그 외 → 도 (제주는 항상 도)
      간선(x): 도시고속화도로 테이블 → 기관 / 없으면 시군구
  · 인식된 도로 없음: 시군구 폴백 → "OO시 도로관리부서 (시군도 추정)"
    ↓
[검색어 보정] 검색어가 IC/JC/TG 등으로 끝나면 500m 내 고속국도 후보 우선
    ↓
결과 카드 + [백그라운드] Supabase query_logs 저장 (nolog=1 시 생략)
```

**별도 경로 — 노선명+km 검색** (직제 대조·내부 검증용):
검색어가 `노선명 숫자` 패턴이면 지오코딩을 건너뛰고 `findRoutePointByKm()`으로
`highway-grid.json`에서 노선명 부분일치 + 최근접 km 포인트를 바로 반환한다.
(요청 km에서 10km 초과 이탈 시 일반 검색으로 폴백)

**주요 파일**: `lib/road-analyzer.ts`(탐색), `lib/highway-jurisdiction.ts`(직제·민자),
`lib/road-rules.ts`(도로법 규칙), `app/api/search/route.ts`(단일 API)

### 2-1. 관리주체 판정 근거자료 — 신뢰도 계층 (2026-08-13 재정의)

판정에 쓰는 표들은 출처 신뢰도가 서로 다르다. **공식 원문서가 있으면 그걸 최우선으로 따르고,
없을 때만 개별 조사로 구축한 보조자료로 보완한다**는 것이 핵심 원칙이다.

**고속국도 (`highway-jurisdiction.ts: formatAgency`)**

| 순위 | 표 | 근거자료 성격 |
|---|---|---|
| 1 | `JURISDICTION_RULES` (직제) | 회사가 **매년 공식 배포**하는 단일 원문서(직제세부운영계획, hwpx) — 최고 신뢰도 |
| 2 | `PRIVATE_ROAD_CODES` (민자매핑) | CEPHIS 자료·뉴스 등 **개별 조사**로 구축한 보조자료 — 1순위 미등재 시만 적용 |
| 3 | `TRANSFERRED_SECTIONS` (이관) | 개별 조사 보조자료 — 1·2순위 모두 없을 때만 적용 |
| 4 | 폴백 | `"관할 확인 필요 (직제 미기재 구간)"` |

과거엔 민자매핑이 1순위였으나, ETC 좌표코드와 직제 원문의 노선코드가 달라(예: 구리포천선
0291 ↔ 직제상 세종포천선 0290, 같은 물리 구간) 직제 등재분을 놓치는 사례가 발견돼 순서를
변경했다(§4-3, §6 참고 절차). 기존 16개 민자코드·4개 이관구간은 자기 코드 기준으로 직제
항목과 안 겹치게 이미 설계돼 있어 이번 변경으로 기존 판정 결과는 바뀌지 않았다(전수 대조 완료).
단, 이런 "코드 번호는 다른데 물리적으로 같은 도로"인 숨은 사례가 더 있을 가능성은
전수 좌표 대조 전까지는 배제할 수 없다.

**고속국도 외 (`road-rules.ts`)**

| 순위 | 판정 | 근거자료 성격 |
|---|---|---|
| 1 | `PRIVATE_LOCAL_ROADS` (민자 지방도·교량 5건, 도로명 매칭) | 개별 조사 — OSM 등급 상관없이 최우선 |
| 2a | 국도 → 지방국토관리청 (`RRO_BY_SIDO`) | **도로법 제23조 + 5개 지방국토관리청 법정 관할구역** — 신뢰도 높음 |
| 2b | 지방도 → 도(道) (`resolveProvincialRoad`) | **도로법 제23조 원칙 그대로 구현** — 신뢰도 높음 |
| 2c | 주요간선(x) → `URBAN_EXPRESSWAYS`(24건, 개별조사) 매칭, 안 되면 해당 시/군 | 매칭 성공 시만 특정 기관 |
| 3 | 인식된 도로 없음 → `"OO시 도로관리부서 (시군도 추정)"` | 폴백 |

고속국도와 달리 국도·지방도는 관리청이 시/도 단위로 **법령에 고정**돼 있어 "직제표 vs 보조자료"
충돌 구조 자체가 없다(안정적). 리스크는 오직 `PRIVATE_LOCAL_ROADS`·`URBAN_EXPRESSWAYS`
같은 개별조사 하드코딩 목록에서 **누락**이 있을 수 있다는 점.

---

## 3. API

### GET `/api/search`

| 파라미터 | 설명 |
|----------|------|
| `query` | 주소, 장소명, 또는 `노선명 km` 패턴(예: `중부선 220`) |
| `lat`, `lng` | 좌표 직접 지정 (핀 이동 시) |
| `nolog=1` | 이용 로그 저장 생략 (자동 테스트용) |

응답: `{ lat, lng, placeName?, candidates[], recommendation, altCandidates[] }`  
동명 지번(다중 시/도) 감지 시: `{ ambiguous: [{ label, lat, lng }] }` (§15 참고, `recommendation` 없음)

- `recommendation.roadType`: 고속국도 / 일반국도 / 지방도 / 도시고속화도로 / 시군도
- `recommendation.contacts?`: 전북본부 6개 지사 관할일 때만 포함 (§7-1)
- 실측 응답 시간: 좌표 31~48ms, 주소 검색 40~48ms

---

## 4. 데이터 파일

| 파일 | 크기 | 내용 | 출처 |
|------|------|------|------|
| `highway-grid.json` | 4.1MB | 고속도로 중심선 (ETC 코드·노선명·km·좌표, 0.1도 격자) | ETC CSV + 민자 보간 |
| `highway-nodes.json` | 120KB | IC·JC·SA 노드 (이름·routeNo·km) | 공공데이터포털 |
| `osm-road-grid.json` | 7.2MB | 국도·지방도·주요간선 127,113 포인트 | OpenStreetMap |

포인트 키 (압축):

```
highway-grid:  { r: ETC코드, n: 노선명, k: km, a: lat, o: lng }
osm-road-grid: { c: 'n'|'p'|'x', r: 노선번호(0=없음), n: 도로명, a: lat, o: lng }
```

### 4-1. 고속도로 데이터 출처
- **ETC 도로중심선 CSV**: 공공데이터포털 → "한국도로공사 도로중심선"  
  https://www.data.go.kr/data/15045608/fileData.do
- **노드 CSV**: 공공데이터포털 → "한국도로공사 노선별 노드 이정"  
  https://www.data.go.kr/data/15064247/fileData.do
- ETC CSV에 없는 민자 구간은 두 가지 방식으로 보완:
  - **OSM 실도로 형상 추출** (권장, 2026-08-13 도입): Geofabrik OSM 모터웨이 데이터에서 노선명/ref로
    구간을 필터링 → IC·JC 실좌표를 앵커로 Dijkstra 최단경로 추출 → 앵커 간 공식 km 거리 대비
    실측거리 비율(0.5~2.5배)로 검증 → 벗어나는 구간만 직선보간 폴백 → 0.5km 간격 리샘플.
    직선보간보다 실제 도로 곡선에 가까워 다리·해안 등 굴곡 구간에서 오매칭이 크게 줄어듦.
    적용 완료: 인천김포선, 익산평택선의지선, 수원광명선, 봉담송산, 용인서울선, 서울문산선,
    영천상주선, 광주원주선, 남해제3지선, 인천대교선, 평택시흥선, 구리포천지선,
    중앙선(대구부산), 수도권제2순환선(포천~화도), 수도권제2순환선(시화MTV)
  - **IC 좌표 직선 보간** (구 방식, OSM에 도로 형상이 없을 때만): 노드 IC를 지오코딩 → 0.5km 간격
    직선보간. 잔존 적용 구간: 새만금포항선지선, 서산영덕선 말단, 서천공주선

### 4-2. OSM 데이터 (국도·지방도·간선)
- **다운로드**: https://download.geofabrik.de/asia/south-korea-latest-free.shp.zip (로그인 불필요, 544MB)
- **추출 규칙** (`gis_osm_roads_free_1.shp`의 fclass + ref + name):

| OSM 조건 | 분류 |
|----------|------|
| trunk/primary + ref 1~99 | `n` 일반국도 |
| trunk/primary/secondary + ref 100+ | `p` 지방도 (secondary의 2자리 ref는 국가지원지방도) |
| trunk + ref 없음 + 이름 있음 | `x` 주요간선 (분당내곡로, 올림픽대로 등) |
| motorway + ref | 제외 (highway-grid가 담당) |

- 변환: Python 스크립트 (0.5km 간격 샘플링 → 0.1도 격자 인덱싱)
- 갱신: OSM은 매일 갱신되므로 필요 시 재다운로드 → 재변환 (완전 자동화 가능)

### 4-3. 직제 관할 테이블
- **출처**: 한국도로공사 2026년 직제세부운영계획 (hwpx) — 본사 미래전략처 연 1회 배포 (내부 문서)
- **파일**: `lib/highway-jurisdiction.ts` → `JURISDICTION_RULES` (`{ etcCode, kmStart, kmEnd, hq, branch }`)
- **원문 대조 방법**: hwpx는 zip 포맷이므로 압축 해제 후 `Contents/section*.xml`에서 `<hp:t>` 태그 텍스트를 추출해 표 전체를 복원, 코드와 한줄씩 비교
- **km 축 불일치 주의**: 직제 표의 구간과 ETC 좌표가 기점을 다르게 잡는 경우가 있음
  - 완주장수선(0205) 0~24.49km ≡ 새만금포항선의지선(2040)과 동일 물리 구간 — 양쪽 코드에 동일 규칙 등록 필요
  - 당진청주선(0320): 직제는 아산 기점(0~20.98), ETC 좌표는 당진 기점(23.0~44.1) — 오프셋 매핑으로 해결
- **타기관 이관 구간**: `TRANSFERRED_SECTIONS` 배열 (`{ etcCode, kmStart, kmEnd, agency }`) — 직제 범위 밖이지만 이관·민자로 확인된 구간을 도공으로 오판정하지 않도록 별도 관리
  - 예: 경부선 416.05~426km(한남~양재, 2002년 서울시 이관), 중앙선 10.12~108.58km(대구~부산, 신대구부산고속도로(주) 민자), 경인선 0~28.5km(인천대로·국회대로 일반화)
- **직제 미기재 폴백**: 위 테이블에도 없는 구간은 `formatAgency()`가 "관할 확인 필요 (IC명 인근, 직제 미기재 구간)"를 반환 — **도공으로 단정하지 않는 것이 원칙**. 단, 최근접 후보가 미기재이고 +150m 이내 확정 후보(예: 중첩된 경부선)가 있으면 그쪽을 추천

---

## 5. 관리주체 판정 테이블 (`lib/road-rules.ts`)

### 지방국토관리청 관할 (일반국도, 도 지역)
서울·인천·경기→서울청 / 강원→원주청 / 대전·세종·충북·충남→대전청 /
전북·광주·전남→익산청 / 부산·대구·울산·경북·경남→부산청 / 제주→제주특별자치도

> 행정구역 통합 대응: 카카오가 반환하는 신명칭(예: 전남광주통합특별시)도 매핑에 포함.  
> 대도시 판정은 정규식이 아닌 **명시 목록**(METRO_SIDOS) 사용 — 통합시 오매칭 방지.

### 도시고속화도로 테이블 (URBAN_EXPRESSWAYS, 시도|도로명 키)
올림픽대로·강변북로·내부순환로·동부간선로 등 → 서울시설공단 /
분당내곡로·분당수서로 → 서울시·성남시 / 신천대로 → 대구 / 동서고가로·번영로 → 부산시설공단 등 24개

### 민자 지방도·교량 테이블 (PRIVATE_LOCAL_ROADS, 도로명 키)
제3경인고속화도로, 일산대교, 미시령터널, 마창대교, 거가대로

### 제주 특례
제주시·서귀포시는 행정시(자치권 없음) → 국도·지방도 모두 제주특별자치도가 관리

---

## 6. 민자 고속도로 (`lib/highway-jurisdiction.ts` → PRIVATE_ROAD_CODES)

21개 코드 등록. ETC CSV 등재 코드(0171, 0252, 0291, 1300, 1711)와
OSM/보간 포인트 코드(4001, 173, 17, 400, 9171, 9017, 9301, 9052, 9105, 1102, 9153, 9601, 9402, 9055, 9403)로 구분
— 후자 중 OSM 실도로 형상 적용 여부는 §4-1 참조.
직제 미기재이지만 이관·민자로 확인된 구간은 `TRANSFERRED_SECTIONS`(§4-3)에 별도 등록.

### 민자 신설 노선 추가 절차
1. `highway-nodes.json`에서 해당 노선 IC·JC 목록과 공식 km 확인
2. 로컬 API(`/api/search?query={IC명}&nolog=1`)로 IC·JC 좌표 지오코딩 (동명이인 주의 — 시/도로 구분)
3. Geofabrik OSM 모터웨이 데이터에서 해당 노선명/ref로 그래프 구성 후, 앵커 좌표 간 Dijkstra 최단경로
   추출 (§4-1) → 비율 검증 실패 구간만 직선보간 폴백 → 0.5km 리샘플 → `highway-grid.json` 병합
   (고유 코드 부여). OSM에 도로 형상이 없으면 전 구간 직선보간으로 대체
4. `PRIVATE_ROAD_CODES`에 `'코드': '운영사명'` 추가
5. 로컬 서버로 IC명 검색·기존 노선 회귀 테스트 후 `git push` → 배포

### 노선명 병기 (`ROUTE_DISPLAY_ALIAS`)
ETC 도로중심선 CSV의 노선명이 카카오맵 등에 표시되는 공식 노선명과 달라 민원 담당자가 혼동할 수 있는
경우, `lib/highway-jurisdiction.ts`의 `ROUTE_DISPLAY_ALIAS`(ETC코드 → 공식명)에 등록하면
"ETC명(공식명) N.Nkm 지점" 형식으로 병기 표시된다 (`road-analyzer.ts`의 `routeName` 생성부에서 적용).
- 등록 예: `'0291': '세종포천고속도로'` — ETC 데이터명은 "구리포천선"(개통구간 한정), 카카오맵은 노선번호
  전체명 "세종포천고속도로"로 표시
- UI(`app/page.tsx`, `app/stats/page.tsx`)의 km 이정 파싱 정규식은 **문자열 끝의 km 괄호만** 매칭하도록
  구현되어 있어, 병기 괄호가 앞에 추가로 붙어도 "N.Nkm 지점" 표시가 깨지지 않음

### 참고: ETC CSV의 세분화된 코드 체계
ETC 도로중심선 CSV는 하나의 실제 도로를 여러 코드로 세분화해 관리하는 경우가 있다 (예: 0290 세종포천선
[전체 노선, 723행] / 0291 구리포천선 [개통구간, 필요시 확인] / 0292 양주지선 [소흘~양주 지선, 68행]).
새 민자 노선을 §"민자 신설 노선 추가 절차"로 보간/OSM 추출하기 전에, **먼저 ETC CSV에 관련 코드가
이미 있는지(`awk -F',' '$1=="코드"'`로 확인) 검토할 것** — 이미 공식 좌표 데이터가 있다면 보간/OSM
추출보다 그쪽을 그대로 쓰는 것이 더 정확하다.

---

## 7. 클라이언트 UI

| 항목 | 구현 |
|------|------|
| 지도 SDK 로드 | layout에서 `async` + `autoload=false`, 컴포넌트에서 `kakao.maps.load()` 대기 (레이스 방지) |
| 위치 보정 (PC) | 마커 드래그 + 우클릭 |
| 위치 보정 (모바일) | **중앙 고정핀** — 지도를 움직여 지정, `pointer: coarse`로 자동 감지, `?touch=1`로 강제 |
| 도로유형 배지 | 고속국도(녹) 일반국도(청) 지방도(보라) 도시고속화도로(주황) 시군도(회색) |
| 이격 경고 | 200m 초과 시만 표시 |
| 핀 이동 시 검색어 초기화 | `handlePinMove`에서 `setAddress('')` — 이전 검색어가 남아 새 핀 위치와 불일치해 보이는 혼동 방지 |

### 7-1. 지사 연락처 (`lib/branch-contacts.ts`)

`getBranchContacts(branch: string): BranchContact[] | null` — 정적 조회, 외부 API 의존 없음.
현재 **전주·부안·무주·논산·진안·보령지사 6곳만** 등록되어 있고, 그 외 모든 지사는 `null`을 반환해
결과 카드에 연락처 블록 자체가 렌더링되지 않는다 (`lib/road-analyzer.ts`의 `findNearbyHighways()`에서
`lookupJurisdiction()` 결과의 `branch`로 조회 → `RoadCandidate.contacts`에 실어 전달).

```
톨게이트·휴게소   내선 850-XXXX / 외부 063-714-XXXX
교통사고·도로포장  내선 850-XXXX / 외부 063-714-XXXX (뒤 4자리 동일)
```

타 본부로 확대할 때는 해당 본부 연락처를 검증 후 `BRANCH_CONTACTS`에 항목만 추가하면 된다.

---

## 8. 오류 신고 자동 첨부

결과 카드의 "⚠️ 이 결과가 잘못됐나요?" 버튼(또는 결과없음 화면의 신고 링크)을 누르면
마지막 검색 컨텍스트가 URL 쿼리로 `/feedback`에 전달된다.

| 파라미터 | 내용 |
|----------|------|
| `reportQuery` | 마지막 검색어 (주소 검색 시에만) |
| `reportLat`, `reportLng` | 판정된 좌표 |
| `reportRoadType`, `reportRouteName`, `reportAgency` | 판정 결과 |

`/feedback` 페이지는 이 파라미터를 읽어 글쓰기 폼 위에 미리보기로 표시하고(첨부 해제 가능),
게시 시 `posts` 테이블의 `report_*` 컬럼에 저장한다. 게시글 목록에서는 저장된 좌표로
`/?lat=&lng=` 딥링크("🗺️ 지도에서 위치 확인 →")를 제공해 관리자가 즉시 재현할 수 있다.
`app/page.tsx`는 이 딥링크 진입 시 `window.location.search`에서 `lat`/`lng`를 읽어 자동 검색한다.

---

## 9. 관리자 허브 (`/admin`)

메인 헤더의 "⚙️ 관리자" 버튼이 연결되는 페이지. 카드 2개로 `/feedback`(오류 신고 게시판)과
`/stats`(이용 현황 통계)에 진입한다. 개별 결과에 대한 신고는 결과 카드 버튼이 전담하므로
헤더 버튼과 역할이 분리되어 있다. `/feedback`, `/stats` 로그인 후 화면에는 "관리자 홈" 상호
이동 링크가 있다.

---

## 10. 외부 API 키 관리

| 키 | 용도 | 환경변수 |
|----|------|----------|
| Kakao JavaScript SDK | 지도 표시 | `NEXT_PUBLIC_KAKAO_MAP_KEY` |
| Kakao REST API | 주소·키워드·행정구역 | `KAKAO_REST_API_KEY` |
| Supabase URL / Anon Key | DB | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

- Vercel 환경변수 및 `.env.local` 양쪽에 동일하게 설정
- Kakao 앱 설정 → 플랫폼 → JS SDK 도메인에 `complaint-map.vercel.app` 등록 필요

---

## 11. Supabase DB 스키마

```sql
-- 오류 신고 게시판
CREATE TABLE posts (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  nickname text,
  content text,
  likes int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  -- 결과 카드 "이 결과가 잘못됐나요?" 클릭 시 자동 첨부되는 검색 컨텍스트 (§8)
  report_query text,
  report_lat double precision,
  report_lng double precision,
  report_road_type text,
  report_route_name text,
  report_agency text
);

CREATE TABLE comments (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  post_id bigint REFERENCES posts(id) ON DELETE CASCADE,
  nickname text,
  content text,
  created_at timestamptz DEFAULT now()
);

-- 이용 현황 로그 (검색마다 백그라운드 저장, nolog=1 시 생략)
CREATE TABLE query_logs (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  queried_at timestamptz DEFAULT now(),
  input_address text,
  lat double precision,
  lng double precision,
  result_agency text,
  result_agency_full text,
  result_road_type text,      -- 고속국도/일반국도/지방도/도시고속화도로/시군도
  result_route_name text,
  result_distance_m double precision,
  confidence text,            -- 높음/보통/낮음
  found boolean DEFAULT true
);
```

RLS 정책: anon SELECT·INSERT 허용 (게시판·로그 모두 로그인 불필요)

---

## 12. 페이지 구조

| URL | 설명 | 접근 제한 |
|-----|------|-----------|
| `/` | 메인 앱 (지도 + 관할 검색) — `?lat=&lng=` 딥링크, `?touch=1` 모바일 모드 강제 지원 | 없음 |
| `/admin` | 관리자 허브 (신고 게시판·통계 진입 카드) | 없음 (진입만, 각 페이지가 자체 게이트) |
| `/feedback` | 오류 신고 게시판 | 없음 (삭제만 비밀번호) |
| `/stats` | 이용 현황 통계 | 관리자 비밀번호 |

---

## 13. 자동 테스트

`/api/search?...&nolog=1`로 통계 오염 없이 실행. 검증 항목:

1. **좌표 샘플**: 각 그리드에서 무작위 추출 → 같은 노선이 후보에 반환되는지
2. **IC/JC 이름 검색**: 노드 이름으로 검색 → 고속국도 판정되는지 (전체 파이프라인)
3. **전국 무작위 좌표**: 어디를 찍어도 관리주체가 비어있지 않은지 (폴백 검증)
4. **주소 검색**: 대표 주소 8건 (지오코딩+행정구역 재사용 경로)

최종 결과: 318/318 통과, 전국 재검증 310/310 통과 (2026.7 기준, 제주 제외 새 시드).  
고속도로 판정은 프로세스 개편 전후 동일함을 회귀로 보장. 직제 원문 대조는 §4-3 참고.

---

## 14. 이용 현황 통계 (`/stats`)

**통계 요약 탭**: "총 조회 수"·"결과 있음"·"결과 없음"은 `query_logs`에 대한 Supabase **exact count 쿼리**로
별도 조회한다 (2026-08-13 수정 — 이전에는 `.limit(500)`으로 가져온 배열 길이를 그대로 총계로 써서 실제
누적 조회가 500건을 넘으면 항상 500에 고정 표시되는 버그가 있었음). 일별/시간대별/기관 TOP10 차트는
성능상 최근 500건 샘플을 그대로 사용하며, 화면에 "최근 500건 샘플 기준" 캡션으로 명시한다.

### 14-1. 조회 기록 상세보기 (`조회 기록` 탭)

PC 전용 좌측 목록 / 우측 상세 2단 레이아웃. 목록 행 클릭 시 `query_logs`에 **당시 저장된 값 그대로**로
지도+결과카드를 재구성해 우측 패널에 표시한다 (좌표로 재조회하지 않음 — 코드가 그 사이 바뀌면 현재 결과와
달라질 수 있으므로, "그때 사용자가 실제로 본 값"을 보존해서 보여주는 것이 목적).

- 지도: `KakaoMap`에 로그의 `lat`/`lng`를 그대로 전달. `absolute inset-0`로 렌더링되므로
  **부모 컨테이너에 반드시 `relative` + 명시적 높이**가 있어야 함 (없으면 모달/패널 전체를 뒤덮는 버그 발생 — 실제로 겪은 이슈)
- 결과 카드: 메인 화면(`app/page.tsx`)의 결과 카드와 동일한 스타일(배지 색상, 이격 경고, 신뢰도 배지)을 재사용해
  "이용자 화면 그대로"라는 요구사항 충족
- 입력값 표시: `input_address`가 `null`인 로그(핀 이동으로 조회된 경우)는 목록·상세 패널 모두 **"핀 이동"**으로 표시 (이탤릭 회색)
- `reason`(판정 근거 문구)은 로그에 저장하지 않음 — 모니터링 목적에는 기관/노선/거리/신뢰도로 충분하다고 판단

## 15. 동일 지번 다중 후보 처리

`app/api/search/route.ts`의 `geocode()`가 카카오 주소 검색 응답(`documents[]`)에서
**서로 다른 `region_1depth_name`(시/도)가 2개 이상** 섞여 있는지 검사한다.

```ts
const distinctSido = new Set(addrDocs.map(d => (d.address ?? d.road_address)?.region_1depth_name));
if (distinctSido.size > 1) {
  return { ambiguous: addrDocs.map(d => ({ label, lat, lng })) };
}
```

- 모호할 때는 `analyzeRoad()`를 호출하지 않고 즉시 `{ ambiguous: [...] }`를 응답 (불필요한 판정 연산 생략)
- 클라이언트(`app/page.tsx`)는 결과 카드 자리에 후보 선택 목록을 렌더링, 사용자가 고르면
  기존에 지원하던 `?lat=&lng=` 경로(`search({ lat, lng })`)로 재호출 — 별도 API 없이 기존 좌표 검색 경로 재사용
- 시/도가 하나로만 잡히는 절대다수의 검색은 기존과 동일하게 추가 왕복 없이 바로 결과가 나옴

---

## 16. 데이터 갱신 가이드

### 직제 개편 시 (연 1회)
1. 새 hwpx를 zip으로 압축 해제 → `Contents/section*.xml`에서 `<hp:t>` 텍스트 추출해 원문 표 복원
2. `lib/highway-jurisdiction.ts` → `JURISDICTION_RULES` 전수 대조·수정
3. 검색창에 `노선명 km`로 경계 지점을 찍어 직제 표와 육안 대조 (§8 API, §3 노선명+km 검색)
4. push

### OSM 도로 데이터 갱신 시
1. Geofabrik에서 최신 shp.zip 다운로드
2. 변환 스크립트 실행 → `public/data/osm-road-grid.json` 재생성
3. 자동 테스트 → push

### 도시고속화도로·민자 오류 신고 시
`lib/road-rules.ts`의 해당 테이블에 한 줄 추가 → push

### ETC 도로중심선 갱신 시
1. 공공데이터포털에서 최신 CSV 다운로드 → 변환
2. **민자 보간 포인트는 별도 보존 필요** (재생성 시 병합)
3. 자동 테스트 → push
