/**
 * 터치 기기(스마트폰·태블릿) 여부 판단.
 * URL에 ?touch=1 을 붙이면 PC에서도 모바일 모드를 강제로 켤 수 있다 (테스트용).
 */
export function isCoarsePointer(): boolean {
  if (typeof window === 'undefined') return false;
  if (new URLSearchParams(window.location.search).has('touch')) return true;
  return window.matchMedia('(pointer: coarse)').matches;
}
