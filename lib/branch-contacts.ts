/**
 * 전북본부 지사별 담당 연락처 (검증된 본부만 노출 — 타 본부는 오류 위험으로 제외)
 * 내선 850-XXXX ↔ 외부 063-714-XXXX (동일 뒤 4자리)
 */

export interface BranchContact {
  label: string;
  phone: string;
}

const BRANCH_CONTACTS: Record<string, BranchContact[]> = {
  '전주지사': [
    { label: '톨게이트·휴게소', phone: '063-714-6211' },
    { label: '교통사고·도로포장', phone: '063-714-6241' },
  ],
  '부안지사': [
    { label: '톨게이트·휴게소', phone: '063-714-6311' },
    { label: '교통사고·도로포장', phone: '063-714-6341' },
  ],
  '무주지사': [
    { label: '톨게이트·휴게소', phone: '063-714-6412' },
    { label: '교통사고·도로포장', phone: '063-714-6441' },
  ],
  '논산지사': [
    { label: '톨게이트·휴게소', phone: '063-714-6510' },
    { label: '교통사고·도로포장', phone: '063-714-6541' },
  ],
  '진안지사': [
    { label: '톨게이트·휴게소', phone: '063-714-6611' },
    { label: '교통사고·도로포장', phone: '063-714-6641' },
  ],
  '보령지사': [
    { label: '톨게이트·휴게소', phone: '063-714-6711' },
    { label: '교통사고·도로포장', phone: '063-714-6741' },
  ],
};

export function getBranchContacts(branch: string): BranchContact[] | null {
  return BRANCH_CONTACTS[branch] ?? null;
}
