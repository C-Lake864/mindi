import { domain } from "../config/domain";
import type { RetrievalResult, ScopeBand, ScopeCheck } from "./types";

/**
 * 정답을 바로 달라는 요청인가.
 *
 * 이 판정만은 검색이 아니라 표현으로 한다. "그냥 답 알려주세요"는 자료 안
 * 개념을 묻는 말이라 유사도가 높게 나오기 때문이다. 유사도로는 가려낼 수 없다.
 *
 * 넓게 잡지 않는다. "모르겠어요"는 요구가 아니라 낮은 자신감의 표현이고,
 * 그것까지 거절로 처리하면 완화 질문으로 갈 기회를 없앤다.
 */
const ANSWER_DEMAND = [
  /그냥\s*(좀\s*)?(알려|가르쳐|말해|설명)/,
  /(정답|답)\s*(을|를)?\s*(알려|가르쳐|말해|보여|주세요|줘)/,
  /답\s*이?\s*뭐(예요|에요|야|냐)/,
  /(설명|정리)\s*(해|좀)\s*(주세요|줘|해줘)/,
  /(힌트|문제)\s*말고/,
  /(포기|모르겠으니).*(알려|가르쳐)/,
];

export function isAnswerDemand(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  return ANSWER_DEMAND.some((re) => re.test(t));
}

export function bandOf(topCosine: number): ScopeBand {
  const { accept, ask } = domain.retrieval.scope;
  if (topCosine >= accept) return "안";
  if (topCosine >= ask) return "확인";
  return "밖";
}

/**
 * 범위 판정 (PRD F8).
 *
 * 루브릭은 *이미 고른 개념*의 요소 목록이라 자료 밖을 알지 못한다.
 * 이 판정만은 검색 유사도로만 할 수 있고, 그것이 이 제품에 검색이 있는
 * 첫 번째 이유다 (PRD 7.2 ①).
 *
 * 구간은 탐침 14건 실측으로 정했다. `npm run probe` 가 회귀 검사다.
 */
export function checkScope(text: string, retrieval: RetrievalResult): ScopeCheck {
  const top = retrieval.topCosine;
  return {
    band: bandOf(top),
    topCosine: top,
    nearest: retrieval.hits[0]?.chunk ?? null,
    answerDemand: isAnswerDemand(text),
  };
}
