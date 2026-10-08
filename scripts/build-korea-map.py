"""
지역별 통계 지도(components/RegionStatsMap.tsx)용 SVG 경로를 만든다 → lib/korea-map-paths.ts (자동 생성, 직접 수정 금지)

원본: 통계청 통계지리정보서비스(SGIS) 센서스용 행정구역경계 2018, 공공누리 제1유형(출처 표시)
      https://github.com/southkorea/southkorea-maps (kostat/2018/json/skorea-provinces-2018-geo.json)
      → ../data-sources/sido-boundary/ 에 원본 보관

처리 순서
 1. 17개 시도를 한꺼번에 단순화(coverage_simplify) — 인접한 도 경계가 서로 어긋나 틈이 생기는 걸 막는다
 2. 특별시·광역시를 소재 도에 합침 — 매핑은 lib/sido-groups.ts의 PROVINCE_OF를 그대로 읽는다(한 곳에서만 관리)
 3. 너무 작은 섬·멀리 떨어진 서해 섬·울릉도·독도는 버린다(사용자 요청 — 육지 쪽 지도만 보여준다)
 4. 제주는 지도에 그리지 않는다(사용자 요청 — 제주 조회 기록이 있어도 지도엔 표시 안 함, 순위 목록에는 나온다)
 5. 경위도 → SVG 좌표로 바꾸고, 숫자를 얹을 라벨 위치(도형 안에서 가장 넓은 지점)를 계산한다

실행: python3 scripts/build-korea-map.py   (shapely 필요: pip3 install shapely)
"""
import json
import math
import pathlib
import re

from shapely import coverage_simplify
from shapely.geometry import Polygon, shape
from shapely.ops import polylabel, unary_union

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT.parent / 'data-sources' / 'sido-boundary' / 'skorea-provinces-2018-geo.json'
GROUPS_TS = ROOT / 'lib' / 'sido-groups.ts'
OUT = ROOT / 'lib' / 'korea-map-paths.ts'

SIMPLIFY_TOL = 0.012      # 도(°) ≈ 1.3km — 이보다 작은 굴곡은 뭉갠다
MIN_ISLAND_AREA = 0.0015  # 도² ≈ 15km² — 이보다 작은 섬은 버린다
CLOSE_GAP = 0.004         # 도 — 합칠 때 원본 경계 사이에 남는 미세한 틈(≈400m 이하)을 메운다
FAR_WEST_LON = 125.6      # 이보다 서쪽 섬(백령도·흑산도 등)은 버린다
ULLEUNG_LON = 130.0       # 이보다 동쪽(울릉도·독도)은 버린다
SCALE = 150.0             # 1도당 px
PAD = 12.0
COS = math.cos(math.radians(36.0))

NAME_FIX = {'강원도': '강원특별자치도', '전라북도': '전북특별자치도'}  # 2018 데이터는 옛 이름


def read_province_of():
    text = GROUPS_TS.read_text(encoding='utf-8')
    body = text[text.index('PROVINCE_OF'):text.index('};')]
    return dict(re.findall(r"'([^']+)':\s*'([^']+)'", body))


def parts(g):
    return list(g.geoms) if g.geom_type == 'MultiPolygon' else [g]


def main():
    province_of = read_province_of()
    feats = json.loads(SRC.read_text(encoding='utf-8'))['features']
    names = [NAME_FIX.get(f['properties']['name'], f['properties']['name']) for f in feats]
    simplified = list(coverage_simplify([shape(f['geometry']) for f in feats], SIMPLIFY_TOL))

    grouped = {}
    for name, g in zip(names, simplified):
        grouped.setdefault(province_of.get(name, name), []).append(g)

    shapes = {}  # 도 → 조각(Polygon) 목록 (경위도)
    for province, gs in grouped.items():
        if province == '제주특별자치도':
            continue
        if len(gs) > 1:
            # 서울·대전 등을 합칠 때 원본 경계가 완전히 맞물리지 않아 안쪽에 흰 윤곽선이 남는다 → 틈을 메우고 안쪽 구멍을 없앤다
            merged = unary_union([g.buffer(CLOSE_GAP, join_style='mitre') for g in gs]).buffer(-CLOSE_GAP, join_style='mitre')
            merged = unary_union([Polygon(q.exterior) for q in parts(merged)]).simplify(SIMPLIFY_TOL / 2)
        else:
            merged = gs[0]
        kept = []
        for p in parts(merged):
            c = p.centroid
            if p.area < MIN_ISLAND_AREA:
                continue
            if c.x < FAR_WEST_LON:
                continue
            if c.x > ULLEUNG_LON:
                continue
            kept.append(p)
        shapes[province] = kept

    # 전체 범위 → SVG 좌표
    xs, ys = [], []
    for ps in shapes.values():
        for p in ps:
            b = p.bounds
            xs += [b[0], b[2]]
            ys += [b[1], b[3]]
    lon0, lat_top = min(xs), max(ys)

    def px(lon, lat):
        return ((lon - lon0) * COS * SCALE + PAD, (lat_top - lat) * SCALE + PAD)

    width = round((max(xs) - lon0) * COS * SCALE + PAD * 2, 1)
    height = round((lat_top - min(ys)) * SCALE + PAD * 2, 1)

    def ring_d(coords):
        pts = [px(x, y) for x, y in coords]
        return 'M' + 'L'.join(f'{x:.1f},{y:.1f}' for x, y in pts[:-1]) + 'Z'

    out = []
    for province, ps in shapes.items():
        d = ''
        for p in ps:
            d += ring_d(p.exterior.coords)
            for hole in p.interiors:
                d += ring_d(hole.coords)
        biggest = max(ps, key=lambda q: q.area)
        label = polylabel(biggest, tolerance=0.01)
        lx, ly = label.x, label.y
        cx, cy = px(lx, ly)
        out.append({'province': province, 'd': d, 'cx': round(cx, 1), 'cy': round(cy, 1)})

    ts = (
        '// 자동 생성 파일 — scripts/build-korea-map.py 로 만든다. 직접 고치지 말고 스크립트를 수정해 다시 돌릴 것.\n'
        '// 경계 원본: 통계청 통계지리정보서비스(SGIS) 센서스용 행정구역경계 2018 (공공누리 제1유형), 단순화·합산 처리(제주·울릉도·독도 제외, 육지만).\n'
        f'export const KOREA_MAP = {json.dumps({"width": width, "height": height, "provinces": out}, ensure_ascii=False)} as const;\n'
    )
    OUT.write_text(ts, encoding='utf-8')
    print(f'{OUT.relative_to(ROOT)}: {len(ts)/1024:.0f}KB, viewBox {width}x{height}')
    for o in out:
        print(f"  {o['province']:8} 경로 {len(o['d'])/1024:5.1f}KB 라벨 ({o['cx']}, {o['cy']})")


if __name__ == '__main__':
    main()
