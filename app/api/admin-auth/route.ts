import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';

// 관리자 비밀번호 확인 — 비밀번호는 서버 환경변수(ADMIN_PASSWORD)에만 있고 브라우저 코드에는 실리지 않는다.
// 환경변수가 비어 있으면 어떤 입력도 통과시키지 않는다(빈 값끼리 같다고 열리는 것을 막음).
const sha = (s: string) => createHash('sha256').update(s).digest();

export async function POST(req: NextRequest) {
  const expected = process.env.ADMIN_PASSWORD ?? '';
  if (!expected) return NextResponse.json({ ok: false, error: 'not-configured' }, { status: 503 });

  let password = '';
  try {
    const body = await req.json();
    if (typeof body?.password === 'string') password = body.password;
  } catch {
    // 본문이 비었거나 JSON이 아니면 빈 입력으로 취급
  }

  const ok = timingSafeEqual(sha(password), sha(expected));
  // 틀렸을 때 짧게 지연시켜 무차별 대입 속도를 늦춘다
  if (!ok) await new Promise(r => setTimeout(r, 400));
  return NextResponse.json({ ok }, { status: ok ? 200 : 401 });
}
