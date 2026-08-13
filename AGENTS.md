<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# PRD.md / BRD.md 동기화

소스 코드(기능, 아키텍처, 데이터 구조, 정책값 등)를 변경한 뒤에는 같은 작업 안에서 `PRD.md`·`BRD.md`도 함께 갱신한다.

- **PRD.md**: 기술 스택, 아키텍처/데이터 흐름, API, 데이터 파일, 판정 테이블, DB 스키마, 페이지 구조 등 "어떻게 동작하는가"에 해당하는 부분이 바뀌면 관련 섹션을 갱신
- **BRD.md**: 사용자 시나리오, 기능 요구사항, 정책값(예: 이격 경고 임계값), 품질 검증 기준 등 "무엇을/왜"에 해당하는 부분이 바뀌면 관련 섹션을 갱신
- 두 문서 모두 상단의 "최종 수정: YYYY년 M월 D일 (변경 요약)" 줄을 오늘 날짜와 이번 변경 요약으로 갱신 (기존 컨벤션 유지, 별도 변경 이력 섹션 없음)
- 오타 수정, 리팩터링 등 제품 동작·구조에 영향 없는 변경은 생략 가능
- 어느 섹션을 고쳐야 할지 애매하면 갱신을 건너뛰지 말고 가장 관련 있는 섹션에 반영
