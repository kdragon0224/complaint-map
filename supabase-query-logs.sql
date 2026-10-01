-- 이용 현황 로그 테이블
create table if not exists query_logs (
  id bigint primary key generated always as identity,
  queried_at timestamptz default now(),
  input_address text,
  lat double precision,
  lng double precision,
  result_agency text,
  result_agency_full text,
  result_road_type text,
  result_route_name text,
  result_distance_m double precision,
  confidence text,
  found boolean default true
);

-- RLS
alter table query_logs enable row level security;

-- 서버(service role)만 insert 가능 — anon은 읽기만
create policy "anon read query_logs" on query_logs for select using (true);
create policy "service insert query_logs" on query_logs for insert with check (true);

-- 2026-10-01: 지역별 통계(시도별 월별 조회 건수) 기능을 위해 sido 컬럼 추가
-- 기존 행은 scripts/backfill-sido.ts로 좌표→시도 역지오코딩 일괄 채움
alter table query_logs add column if not exists sido text;
create index if not exists query_logs_sido_idx on query_logs (sido);
