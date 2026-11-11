import type { Complex } from '@/types'

export interface ComplexFacts {
  households: number | null
  dongCount: number | null
  topFloor: number | null
  basementFloors: number | null
  parking: number | null
  useDate: string | null
  coverageRatio: number | null // 건폐율(%)
  floorAreaRatio: number | null // 용적률(%)
  /** 값의 출처 설명(없으면 null) */
  basis: string | null
}

/**
 * 단지 기본 사실. K-apt 공동주택 기본정보를 우선 쓰고, 없는 항목은 건축물대장으로 채운다.
 * 어느 쪽에도 없으면 null(화면에서 "자료 확인 불가").
 */
export function complexFacts(c: Complex): ComplexFacts {
  const k = c.kapt
  const b = c.building ?? null
  const used = [k && 'K-apt 공동주택 기본정보', b && b.basis].filter(Boolean) as string[]
  return {
    households: k?.households ?? b?.households ?? null,
    dongCount: k?.dongCount ?? b?.dongCount ?? null,
    topFloor: k?.topFloor ?? b?.topFloor ?? null,
    basementFloors: b?.basementFloors ?? null,
    parking: k?.parkingTotal ?? b?.parking ?? null,
    useDate: k?.useDate ?? b?.useDate ?? null,
    coverageRatio: b?.coverageRatio ?? null,
    floorAreaRatio: b?.floorAreaRatio ?? null,
    basis: used.length ? used.join(' · ') : null,
  }
}
