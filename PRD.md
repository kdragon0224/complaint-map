# PRD — 도로 관리주체 확인앱
> Product Requirements Document (기술 레퍼런스)  
> 작성: 한국도로공사 전북본부 | 최초 작성: 2026년 6월 | 최종 수정: 2026년 6월

---

## 1. 기술 스택

| 구분 | 기술 |
|------|------|
| 프레임워크 | Next.js 16 (App Router, TypeScript) |
| 스타일 | Tailwind CSS v4 |
| 지도 | Kakao Maps JavaScript SDK (`libraries=services`) |
| 주소검색 | Kakao Local REST API (주소검색 + 키워드검색 병렬 실행) |
| 기관 연락처 | Kakao Places API (기관명 키워드로 전화번호·주소 자동 조회) |
| DB | Supabase (PostgreSQL) — 오류 신고 게시판, 이용 로그 |
| 배포 | GitHub → Vercel 자동 배포 (main 브랜치 push 시 즉시 반영) |
| 도메인 | https://complaint-map.vercel.app |

---

## 2. 기초 데이터 출처 및 처리 방법

### 2-1. 고속도로 도로 중심선 (위치 탐색용)
- **파일명**: `ETC_도로중심선_1년_1년_2025.csv`
- **획득 방법**: 공공데이터포털(data.go.kr) → "한국도로공사 도로중심선" 검색 → 파일 다운로드  
  🔗 https://www.data.go.kr/data/15045608/fileData.do
- **포맷**: ETC 4자리 코드, 도로명, 이정(km), 위경도(WGS84)
- **처리**: Python 스크립트로 CSV → `public/data/highway-grid.json` 변환
  - 위경도를 0.1도 격자로 인덱싱 → 핀 근처(500m 이내) 포인트 고속 조회
  - 기본 58,846개 포인트 + 민자 보간 포인트 추가분
- **성격**: 도로 **선(線)** 데이터 — KEC ETC 시스템 기준이므로 일부 민자 구간 미포함

### 2-2. 고속도로 노드 정보 (IC·JC·SA 이름 참조용)
- **파일명**: `한국도로공사_노선별 노드 이정 정보_20250630.csv`
- **획득 방법**: 공공데이터포털(data.go.kr) → "한국도로공사 노선별 노드 이정" 검색 → 파일 다운로드  
  🔗 https://www.data.go.kr/data/15064247/fileData.do
- **포맷**: 노드ID, 노드명(IC·JC명), 노선번호(routeNo), 노선명, 타입코드, 이정(km)
- **처리**: `public/data/highway-nodes.json` 으로 변환 (908개 노드)
- **활용**: 핀 위치 인근 IC·JC명을 결과 카드의 이정 표시에 활용
- **성격**: 도로 **점(點)** 데이터 — IC·JC·SA 등 특정 지점의 이름과 이정만 포함

> ⚠️ **2-1과 2-2는 대소 관계가 아닌 독립(병렬) 데이터**  
> 같은 노선이라도 한쪽에만 존재할 수 있음.
>
> | 상태 | 결과 |
> |------|------|
> | ETC ○ + 노드 ○ | 정상 (위치 탐색 + IC명 표시) |
> | ETC ○ + 노드 ✕ | 위치는 찾지만 IC명 모름 |
> | ETC ✕ + 노드 ○ | 고속도로 탐지 불가 → 인근 국도로 대체됨 ← **보간으로 해결** |
> | ETC ✕ + 노드 ✕ | 결과 없음 |
>
> ETC ✕ + 노드 ○ 상태의 민자 구간은 Kakao Places API로 IC 좌표를 획득한 뒤  
> 0.5km 간격 보간 포인트를 `highway-grid.json`에 수동 추가하여 해결.

### 2-3. 국도 중심선
- **파일명**: `국도중심선_1km간격_전국.csv`
- **획득 방법**: 공공데이터포털(data.go.kr) → "국토교통부 일반국도 도로중심선" 검색 → 파일 다운로드  
  🔗 https://www.data.go.kr/data/15122482/fileData.do
- **처리**: `public/data/national-road-grid.json` 변환 (15,992개 포인트)
- **현재 상태**: 데이터는 로드되나 국도 관할 기관 매핑은 미구현 (향후 과제)

### 2-4. 관할 구간 테이블
- **출처**: 한국도로공사 2026년 직제세부운영계획 (hwpx)
- **획득 방법**: 매년 초 본사 미래전략처에서 산하기관에 배포 — 내부 문서이므로 외부 다운로드 불가
- **파일**: `lib/highway-jurisdiction.ts` 내 `JURISDICTION_RULES` 배열
- **구조**: `{ etcCode, kmStart, kmEnd, hq, branch }` 형태로 수동 입력
- **조회 방식**: ETC 코드 + km 범위 직접 매핑 (정규화 오차 없음)
- **갱신 주기**: 조직 개편 시 (통상 연 1회 초)

---

## 3. 핵심 로직: 위치 → 관리기관 매핑

```
사용자 입력 (주소 또는 IC·JC명)
    ↓
[Kakao Local API] 주소검색 + 키워드검색 병렬 실행
  → 주소 결과 있으면 즉시 사용
  → 키워드 결과는 고속도로 시설(IC·JC·SA) 우선 정렬
    ↓
핀 위치 (위경도) 확정
    ↓
[1단계] highway-grid.json 에서 반경 500m 이내 고속도로 포인트 조회
         (0.1도 격자 인덱싱으로 O(1) 검색)
    ↓
[2단계] 가장 가까운 포인트의 routeNo + km 값 추출
    ↓
[3단계] PRIVATE_ROAD_CODES 에서 민자 여부 확인
    → 민자이면: 운영사명 반환 (예: 경기동서순환도로(주))
    → 공사이면: JURISDICTION_RULES 에서 hq + branch 조회
    ↓
[4단계] 결과 카드 표시
  공사: "한국도로공사 {지역본부} {지사}"
  민자: "{운영사명}"
  + 노선명, 이정, 전화번호(Kakao Places), 이격거리 경고(200m 초과 시)
    ↓
[백그라운드] Supabase query_logs 테이블에 조회 이력 저장
```

**주요 파일**: `lib/road-analyzer.ts`, `lib/highway-jurisdiction.ts`, `app/api/analyze/route.ts`

---

## 4. ETC 코드 체계

ETC CSV는 **4자리 숫자 문자열**을 코드로 사용한다.  
`highway-nodes.json`의 `routeNo`는 노선번호(정수 문자열)이므로 **양쪽 체계가 다름**에 주의.

| ETC코드 | routeNo | 노선명 | 비고 |
|---------|---------|--------|------|
| `0010` | `1` | 경부선 | 공사 |
| `0250` | `25` | 호남선 | 공사 |
| `0171` | `17` (일부) | 평택화성선 | 민자 (경기고속도로(주)) |
| `1000` | `100` | 수도권제1순환선 | 공사 |
| `4000` | — | 수도권제2순환선(이천~파주) | 공사 |
| `400` (특수) | `400` | 수도권제2순환선(봉담~송산) | 민자, ETC CSV 미등재 |
| `1711` | — | 오산화성선 | 민자 (경기고속도로(주)) |
| — | `17` (민자 구간) | 수원광명선 | 민자, ETC CSV 미등재 |
| — | `4001` | 인천김포선 | 민자, ETC CSV 미등재 |
| — | `173` | 익산평택선의지선 | 민자, ETC CSV 미등재 |

> routeNo `17`은 평택화성선(공사, ETC코드 `0171`)과 수원광명선(민자) 양쪽에 걸쳐 있음.  
> ETC CSV에 있는 구간(`0171`)은 공사 geometry로 처리, 없는 민자 구간(`17`)은 보간으로 별도 처리.

---

## 5. 민자도로 관리

`lib/highway-jurisdiction.ts` 내 `PRIVATE_ROAD_CODES`:

```typescript
const PRIVATE_ROAD_CODES: Record<string, string> = {
  '0171': '경기고속도로(주)',           // 평택화성선 (ETC CSV 등재)
  '0252': '천안논산고속도로(주)',       // 논산천안선 (ETC CSV 등재)
  '0291': '서울북부고속도로(주)',       // 구리포천선 (ETC CSV 등재)
  '1300': '신공항하이웨이(주)',         // 인천국제공항선 (ETC CSV 등재)
  '1711': '경기고속도로(주)',           // 오산화성선 (ETC CSV 등재)
  '4001': '인천김포고속도로(주)',       // 인천김포선 (보간 포인트)
  '173':  '서부내륙고속도로(주)',       // 익산평택선의지선 (보간 포인트)
  '17':   '수도권서부고속도로(주)',     // 수원광명선 민자 구간 (보간 포인트)
  '400':  '경기동서순환도로(주)',       // 수도권제2순환선 봉담~송산 (보간 포인트)
};
```

### 민자 신설 노선 추가 절차

**Case A — ETC CSV에 geometry 있는 경우**
1. ETC CSV에서 해당 노선의 4자리 코드 확인
2. `PRIVATE_ROAD_CODES`에 `'코드': '운영사명'` 한 줄 추가
3. `git push` → 배포

**Case B — ETC CSV에 없는 경우 (보간 필요)**
1. `highway-nodes.json`에서 해당 routeNo의 IC·JC 목록 확인
2. Kakao Places API로 주요 IC 좌표 검색
3. Python 보간 스크립트로 0.5km 간격 포인트 생성 → `highway-grid.json`에 추가
4. `PRIVATE_ROAD_CODES`에 `'routeNo': '운영사명'` 추가
5. `git push` → 배포

---

## 6. 주소 검색 로직

`app/api/geocode/route.ts`:

1. **주소검색 + 키워드검색 동시 실행** — `Promise.all()`로 병렬화
2. 주소검색 결과 있으면 즉시 반환 (숫자 포함 주소는 정확도 높음)
3. 키워드 결과는 고속도로 시설 우선 정렬 후 반환

**고속도로 우선 키워드**: `IC`, `JC`, `인터체인지`, `분기점`, `휴게소`, `SA`, `한국도로공사`, `도로공사`, `고속도로`

---

## 7. 외부 API 키 관리

| 키 | 용도 | 환경변수 |
|----|------|----------|
| Kakao JavaScript SDK | 지도 표시, Places 검색 | `NEXT_PUBLIC_KAKAO_MAP_KEY` |
| Kakao REST API | 주소·키워드 검색 | `KAKAO_REST_API_KEY` |
| Supabase URL | DB 연결 | `NEXT_PUBLIC_SUPABASE_URL` |
| Supabase Anon Key | DB 읽기/쓰기 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

- Vercel 환경변수 및 `.env.local` 양쪽에 동일하게 설정
- Kakao 앱 설정 → 플랫폼 → JS SDK 도메인에 `complaint-map.vercel.app` 등록 필요

---

## 8. Supabase DB 스키마

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

-- 이용 현황 로그 (검색마다 백그라운드 저장)
CREATE TABLE query_logs (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  queried_at timestamptz DEFAULT now(),
  input_address text,        -- 사용자 입력 주소
  lat double precision,
  lng double precision,
  result_agency text,        -- 지사명 (축약)
  result_agency_full text,   -- 지사명 (전체)
  result_road_type text,     -- 고속국도 / 일반국도
  result_route_name text,    -- 노선명 (이정 포함)
  result_distance_m double precision,  -- 핀~노선 이격거리(m)
  confidence text,           -- 높음 / 보통 / 낮음
  found boolean DEFAULT true
);
```

RLS 정책: anon SELECT 허용, anon INSERT 허용 (게시판·로그 모두 로그인 불필요)

---

## 9. 페이지 구조

| URL | 설명 | 접근 제한 |
|-----|------|-----------|
| `/` | 메인 앱 (지도 + 관할 검색) | 없음 |
| `/feedback` | 오류 신고 게시판 | 없음 (삭제만 비밀번호) |
| `/stats` | 이용 현황 통계 | 관리자 비밀번호 |

---

## 10. 데이터 갱신 가이드

### 관할 구간 변경 시 (조직 개편 등)
1. 한국도로공사 직제세부운영계획 최신본 확인 (본사 미래전략처 배포)
2. `lib/highway-jurisdiction.ts` → `JURISDICTION_RULES` 배열 수정
3. `git push origin main` → Vercel 자동 배포

### 도로 중심선 데이터 갱신 시
1. 공공데이터포털에서 ETC_도로중심선 최신 CSV 다운로드
2. Python 변환 스크립트 실행 → `public/data/highway-grid.json` 재생성
   - 민자 보간 포인트(봉담~송산, 수원광명선 등)는 별도 보존 필요
3. `git push origin main` → Vercel 자동 배포

### 민자 운영사 변경 시
1. `lib/highway-jurisdiction.ts` → `PRIVATE_ROAD_CODES` 수정
2. `git push origin main` → Vercel 자동 배포

### 민자 신설 노선 추가 시
1. 노드 CSV에서 routeNo 및 IC 목록 확인
2. Kakao Places API로 IC 좌표 조회
3. Python 보간 스크립트로 포인트 생성 → `highway-grid.json` 추가
4. `PRIVATE_ROAD_CODES`에 운영사 등록
5. `git push origin main` → Vercel 자동 배포
