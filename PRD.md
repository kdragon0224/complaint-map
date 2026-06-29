# PRD — 도로 관리주체 확인앱
> Product Requirements Document (기술 레퍼런스)  
> 작성: 한국도로공사 전북본부 | 최초 작성: 2026년 6월

---

## 1. 기술 스택

| 구분 | 기술 |
|------|------|
| 프레임워크 | Next.js 16 (App Router, TypeScript) |
| 스타일 | Tailwind CSS v4 |
| 지도 | Kakao Maps JavaScript SDK (`libraries=services`) |
| 주소검색 | Kakao Local REST API (주소검색 + 키워드검색) |
| 기관 연락처 | Kakao Places API (키워드로 전화번호·주소 자동 조회) |
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
  - 총 58,846개 포인트

### 2-2. 고속도로 노드 정보 (IC·JC·SA 이름 참조용)
- **파일명**: `한국도로공사_노선별 노드 이정 정보_20250630.csv`
- **획득 방법**: 공공데이터포털(data.go.kr) → "한국도로공사 노선별 노드 이정" 검색 → 파일 다운로드  
  🔗 https://www.data.go.kr/data/15064247/fileData.do
- **포맷**: 노드ID, 노드명(IC·JC명), 노선번호, 노선명, 타입코드, 이정(km)
- **처리**: `public/data/highway-nodes.json` 으로 변환 (908개 노드)
- **활용**: 핀 위치 인근 IC·JC명을 fallback 기관명으로 활용

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
핀 위치 (위경도)
    ↓
[1단계] highway-grid.json에서 반경 500m 이내 고속도로 포인트 조회
    ↓
[2단계] 가장 가까운 포인트의 etcCode + km 값 추출
    ↓
[3단계] PRIVATE_ROAD_CODES에서 민자 여부 확인
    → 민자이면: 운영사명 반환 (예: 경기동서순환도로(주))
    → 공사이면: JURISDICTION_RULES에서 hq + branch 조회
    ↓
[4단계] "한국도로공사 {지역본부} {지사}" 형식으로 표시
```

**파일**: `lib/road-analyzer.ts`, `lib/highway-jurisdiction.ts`

---

## 4. ETC 코드 체계

ETC CSV는 **4자리 숫자 문자열**을 코드로 사용한다.  
`highway-nodes.json`의 `routeNo`는 노선번호(정수)를 사용하므로 **양쪽 매핑이 다름** 에 주의.

| ETC코드 | 노선번호(routeNo) | 노선명 |
|---------|-----------------|--------|
| `0010` | `1` | 경부선 |
| `0250` | `25` | 호남선 |
| `1000` | `100` | 수도권제1순환선 |
| `4000` | (없음) | 수도권제2순환선(이천~파주) |
| `400` (특수) | `400` | 수도권제2순환선(봉담~송산) — ETC CSV 미등재, 민자 |

> ⚠️ `400` 코드는 ETC CSV에 없고 highway-nodes.json에만 존재하는 민자 구간.  
> `PRIVATE_ROAD_CODES`에 직접 등록하여 처리.

---

## 5. 민자도로 관리

`lib/highway-jurisdiction.ts` 내 `PRIVATE_ROAD_CODES`:

```typescript
const PRIVATE_ROAD_CODES: Record<string, string> = {
  '0171': '경기고속도로(주)',         // 평택화성선 (서수원~평택)
  '0252': '천안논산고속도로(주)',     // 논산천안선
  '0291': '서울북부고속도로(주)',     // 구리포천선
  '1300': '신공항하이웨이(주)',       // 인천국제공항선
  '400':  '경기동서순환도로(주)',     // 수도권제2순환선 봉담-송산
};
```

**민자 구간 추가 방법**:
1. ETC CSV 또는 highway-nodes.json에서 해당 노선의 코드 확인
2. 민자도로관리지원센터(cephis.koti.re.kr)에서 운영사 확인
3. `PRIVATE_ROAD_CODES`에 `코드: '운영사명'` 한 줄 추가

---

## 6. 주소 검색 로직

`app/api/geocode/route.ts`:

1. **주소검색 + 키워드검색 동시 실행** (Kakao Local API)
2. 주소검색 결과 있으면 즉시 반환
3. 키워드 결과는 고속도로 시설(IC·JC·SA·휴게소) 우선 정렬 후 반환

**고속도로 우선 키워드**: `IC`, `JC`, `인터체인지`, `분기점`, `휴게소`, `SA`, `한국도로공사`, `도로공사`, `고속도로`

---

## 7. 외부 API 키 관리

| 키 | 용도 | 환경변수 |
|----|------|----------|
| Kakao JavaScript SDK | 지도 표시, Places 검색 | `NEXT_PUBLIC_KAKAO_MAP_KEY` |
| Kakao REST API | 주소·키워드 검색 | `KAKAO_REST_API_KEY` |
| Supabase URL | DB 연결 | `NEXT_PUBLIC_SUPABASE_URL` |
| Supabase Anon Key | DB 읽기/쓰기 | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

Vercel 환경변수에 등록, `.env.local`에도 동일하게 설정.  
Kakao 앱 설정 → 플랫폼 → JS SDK 도메인에 `complaint-map.vercel.app` 등록 필요.

---

## 8. Supabase DB 스키마

```sql
-- 오류 신고 게시판
posts (id, nickname, content, likes, created_at)
comments (id, post_id, nickname, content, created_at)

-- 이용 현황 로그 (검색할 때마다 자동 저장)
query_logs (
  id, queried_at,
  input_address,        -- 사용자 입력 주소
  lat, lng,             -- 핀 위치
  result_agency,        -- 지사명 (축약)
  result_agency_full,   -- 지사명 (전체)
  result_road_type,     -- 고속국도 / 일반국도
  result_route_name,    -- 노선명 (이정 포함)
  result_distance_m,    -- 핀~노선 이격거리(m)
  confidence,           -- 높음 / 보통 / 낮음
  found                 -- 결과 있음 여부
)
```

---

## 9. 페이지 구조

| URL | 설명 |
|-----|------|
| `/` | 메인 앱 (지도 + 관할 검색) |
| `/feedback` | 오류 신고 게시판 |
| `/stats` | 이용 현황 통계 (관리자 전용, 비밀번호 보호) |

---

## 10. 데이터 갱신 가이드

### 관할 구간 변경 시 (조직 개편 등)
1. 한국도로공사 직제세부운영계획 최신본 확인
2. `lib/highway-jurisdiction.ts` → `JURISDICTION_RULES` 배열 수정
3. `git push` → Vercel 자동 배포

### 도로 중심선 데이터 갱신 시
1. ETC_도로중심선 최신 CSV 수령
2. 변환 스크립트 실행 → `public/data/highway-grid.json` 재생성
3. `git push` → Vercel 자동 배포

### 민자 운영사 변경 시
1. `lib/highway-jurisdiction.ts` → `PRIVATE_ROAD_CODES` 수정
2. `git push` → Vercel 자동 배포
