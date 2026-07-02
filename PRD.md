# PRD — 도로 관리주체 확인앱
> Product Requirements Document (기술 레퍼런스)  
> 작성: 한국도로공사 전북본부 | 최초 작성: 2026년 6월 | 최종 수정: 2026년 7월

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
    ↓
핀 좌표 확정
    ↓
[도로 인식 1] highway-grid.json — 고속도로 (반경 500m, 0.1도 격자)
  · 200m 이내 발견 시 OSM 탐색 생략 (성능)
    ↓
[도로 인식 2] osm-road-grid.json — 국도(n)·지방도(p)·주요간선(x)
    ↓
[관리주체 판정]
  · 고속국도: highway-jurisdiction.ts
      민자 코드 매칭 → 운영사 / 아니면 JURISDICTION_RULES(직제) → 본부+지사
  · 그 외: road-rules.ts (행정구역 필요 시 coord2regioncode 호출)
      민자 지방도·교량 테이블 → 운영사
      국도: 특별·광역시 또는 시 동지역 → 해당 시 / 그 외 → 지방국토관리청
      지방도: 시 동지역 → 시 / 그 외 → 도 (제주는 항상 도)
      간선(x): 도시고속화도로 테이블 → 기관 / 없으면 시군구
  · 인식된 도로 없음: 시군구 폴백 → "OO시 도로관리부서 (시군도 추정)"
    ↓
[검색어 보정] 검색어가 IC/JC/TG 등으로 끝나면 500m 내 고속국도 후보 우선
    ↓
결과 카드 + [백그라운드] Supabase query_logs 저장 (nolog=1 시 생략)
```

**주요 파일**: `lib/road-analyzer.ts`(탐색), `lib/highway-jurisdiction.ts`(직제·민자),
`lib/road-rules.ts`(도로법 규칙), `app/api/search/route.ts`(단일 API)

---

## 3. API

### GET `/api/search`

| 파라미터 | 설명 |
|----------|------|
| `query` | 주소 또는 장소명 (지오코딩 후 판정) |
| `lat`, `lng` | 좌표 직접 지정 (핀 이동 시) |
| `nolog=1` | 이용 로그 저장 생략 (자동 테스트용) |

응답: `{ lat, lng, placeName?, candidates[], recommendation, altCandidates[] }`

- `recommendation.roadType`: 고속국도 / 일반국도 / 지방도 / 도시고속화도로 / 시군도
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
- ETC CSV에 없는 민자 구간은 **IC 좌표 보간**(노드 IC를 지오코딩 → 0.5km 간격 보간)으로 추가.  
  보완 완료 노선: 인천김포선, 익산평택선의지선, 수원광명선, 봉담송산, 용인서울선, 서울문산선,
  영천상주선, 광주원주선, 남해제3지선, 인천대교선, 평택시흥선, 구리포천지선,
  중앙선(대구부산), 새만금포항선지선, 서산영덕선 말단, 서천공주선, 수도권제2순환선(포천~화도)

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

19개 코드 등록. ETC CSV 등재 코드(0171, 0252, 0291, 1300, 1711)와
보간 포인트 코드(4001, 173, 17, 400, 9171, 9017, 9301, 9052, 9105, 1102, 9153, 9402, 9055)로 구분.

### 민자 신설 노선 추가 절차
1. `highway-nodes.json`에서 해당 노선 IC 목록 확인
2. 로컬 API(`/api/search?query={IC명}&nolog=1`)로 IC 좌표 지오코딩
3. 보간 스크립트로 0.5km 포인트 생성 → `highway-grid.json` 병합 (고유 코드 부여)
4. `PRIVATE_ROAD_CODES`에 `'코드': '운영사명'` 추가
5. `git push` → 배포

---

## 7. 클라이언트 UI

| 항목 | 구현 |
|------|------|
| 지도 SDK 로드 | layout에서 `async` + `autoload=false`, 컴포넌트에서 `kakao.maps.load()` 대기 (레이스 방지) |
| 위치 보정 (PC) | 마커 드래그 + 우클릭 |
| 위치 보정 (모바일) | **중앙 고정핀** — 지도를 움직여 지정, `pointer: coarse`로 자동 감지, `?touch=1`로 강제 |
| 도로유형 배지 | 고속국도(녹) 일반국도(청) 지방도(보라) 도시고속화도로(주황) 시군도(회색) |
| 이격 경고 | 200m 초과 시만 표시 |

---

## 8. 외부 API 키 관리

| 키 | 용도 | 환경변수 |
|----|------|----------|
| Kakao JavaScript SDK | 지도 표시 | `NEXT_PUBLIC_KAKAO_MAP_KEY` |
| Kakao REST API | 주소·키워드·행정구역 | `KAKAO_REST_API_KEY` |
| Supabase URL / Anon Key | DB | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

- Vercel 환경변수 및 `.env.local` 양쪽에 동일하게 설정
- Kakao 앱 설정 → 플랫폼 → JS SDK 도메인에 `complaint-map.vercel.app` 등록 필요

---

## 9. Supabase DB 스키마

```sql
-- 오류 신고 게시판
CREATE TABLE posts (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  nickname text,
  content text,
  likes int DEFAULT 0,
  created_at timestamptz DEFAULT now()
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

## 10. 페이지 구조

| URL | 설명 | 접근 제한 |
|-----|------|-----------|
| `/` | 메인 앱 (지도 + 관할 검색) | 없음 |
| `/feedback` | 오류 신고 게시판 | 없음 (삭제만 비밀번호) |
| `/stats` | 이용 현황 통계 | 관리자 비밀번호 |

---

## 11. 자동 테스트

`/api/search?...&nolog=1`로 통계 오염 없이 실행. 검증 항목:

1. **좌표 샘플**: 각 그리드에서 무작위 추출 → 같은 노선이 후보에 반환되는지
2. **IC/JC 이름 검색**: 노드 이름으로 검색 → 고속국도 판정되는지 (전체 파이프라인)
3. **전국 무작위 좌표**: 어디를 찍어도 관리주체가 비어있지 않은지 (폴백 검증)
4. **주소 검색**: 대표 주소 8건 (지오코딩+행정구역 재사용 경로)

최종 결과: 318/318 통과 (2026.7 기준). 고속도로 판정은 프로세스 개편 전후 동일함을 회귀로 보장.

---

## 12. 데이터 갱신 가이드

### 직제 개편 시 (연 1회)
`lib/highway-jurisdiction.ts` → `JURISDICTION_RULES` 수정 → push

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
