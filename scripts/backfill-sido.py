"""
query_logs 테이블의 sido(시도) 컬럼이 비어있는 과거 행을 좌표 기반으로 일괄 채운다.

사전조건: supabase-query-logs.sql의 "alter table query_logs add column if not exists sido text"
가 먼저 Supabase 대시보드 SQL 에디터에서 실행돼 있어야 한다.

실행: python3 scripts/backfill-sido.py
"""
import re
import json
import time
import urllib.parse
import subprocess

ENV_PATH = '.env.local'


def read_env(name: str) -> str:
    content = open(ENV_PATH, encoding='utf-8').read()
    m = re.search(rf'^{name}=(.+)$', content, re.M)
    if not m:
        raise RuntimeError(f'{name} not found in {ENV_PATH}')
    return m.group(1).strip()


SUPABASE_URL = read_env('NEXT_PUBLIC_SUPABASE_URL')
SERVICE_KEY = read_env('SUPABASE_SERVICE_ROLE_KEY')
KAKAO_KEY = read_env('KAKAO_REST_API_KEY')


def curl_json(method, url, headers=None, data=None):
    cmd = ['curl', '-s', '-X', method]
    for h in (headers or []):
        cmd += ['-H', h]
    if data is not None:
        cmd += ['-d', json.dumps(data)]
    cmd.append(url)
    r = subprocess.run(cmd, capture_output=True, text=True)
    if not r.stdout:
        return None
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        print('응답 파싱 실패:', r.stdout[:200])
        return None


def normalize_sido(name: str) -> str:
    # lib/road-rules.ts의 SIDO_ALIASES와 완전히 동일 (축약형 → 공식 명칭)
    if not name:
        return name
    aliases = {
        '서울': '서울특별시', '부산': '부산광역시', '대구': '대구광역시', '인천': '인천광역시',
        '광주': '광주광역시', '대전': '대전광역시', '울산': '울산광역시', '세종': '세종특별자치시',
        '경기': '경기도', '강원': '강원특별자치도', '충북': '충청북도', '충남': '충청남도',
        '전북': '전북특별자치도', '전남': '전라남도', '경북': '경상북도', '경남': '경상남도',
        '제주': '제주특별자치도',
    }
    return aliases.get(name, name)


def fetch_rows_without_sido(limit=1000, offset=0):
    headers = [
        f'apikey: {SERVICE_KEY}',
        f'Authorization: Bearer {SERVICE_KEY}',
    ]
    url = (
        f'{SUPABASE_URL}/rest/v1/query_logs'
        f'?select=id,lat,lng&sido=is.null&lat=not.is.null&lng=not.is.null'
        f'&order=id.asc&limit={limit}&offset={offset}'
    )
    return curl_json('GET', url, headers) or []


def update_sido(row_id, sido):
    headers = [
        f'apikey: {SERVICE_KEY}',
        f'Authorization: Bearer {SERVICE_KEY}',
        'Content-Type: application/json',
    ]
    url = f'{SUPABASE_URL}/rest/v1/query_logs?id=eq.{row_id}'
    curl_json('PATCH', url, headers, {'sido': sido})


def coord_to_sido(lat, lng):
    headers = [f'Authorization: KakaoAK {KAKAO_KEY}']
    url = f'https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x={lng}&y={lat}'
    d = curl_json('GET', url, headers)
    if not d:
        return None
    docs = d.get('documents') or []
    doc = next((x for x in docs if x.get('region_type') == 'B'), docs[0] if docs else None)
    if not doc:
        return None
    return normalize_sido(doc.get('region_1depth_name') or '')


def main():
    # 좌표 반올림 단위로 캐시해서 동일/인접 좌표에 대한 중복 API 호출을 줄인다 (0.01도 ≈ 1km)
    cache = {}
    total_updated = 0
    total_failed = 0

    while True:
        rows = fetch_rows_without_sido(limit=200)
        if not rows:
            break
        for row in rows:
            lat, lng = row.get('lat'), row.get('lng')
            if lat is None or lng is None:
                update_sido(row['id'], None)
                continue
            key = (round(lat, 2), round(lng, 2))
            if key not in cache:
                cache[key] = coord_to_sido(lat, lng)
                time.sleep(0.05)  # 카카오 API 과호출 방지
            sido = cache[key]
            if sido:
                update_sido(row['id'], sido)
                total_updated += 1
            else:
                total_failed += 1
                print('조회 실패:', row['id'], lat, lng)
        print(f'진행: {total_updated}건 채움, {total_failed}건 실패, 캐시 {len(cache)}개 좌표')

    print(f'완료 — 총 {total_updated}건 채움, {total_failed}건 실패')


if __name__ == '__main__':
    main()
