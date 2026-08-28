import { domain } from "../config/domain";
import { isAchieved, pickHintTarget, unmetRequired } from "./rubric";
import type { Diagnosis, Rubric, RubricElement, Session } from "./types";

export const MAX_RETRIES = domain.hints.maxRetries;
export const MAX_CONFIRMS = 2;

export function newSession(rubricId: string): Session {
  return { rubricId, easedOnce: false, confirms: 0, turns: [], hintLevel: 0, attempts: 0, ending: null, latest: null };
}

/**
 * 진단 뒤에 무엇을 할지 정한다.
 *
 * 여기가 F4 종료 조건이 사는 자리다. 이 규칙이 없으면 무한 루프가 되고,
 * 그 지점이 좌절 이탈의 최대 발생 구간이다 (PRD F4).
 */
export type NextStep =
  | { kind: "achieved" }
  | { kind: "confirm"; question: string }
  | { kind: "correct" }
  | { kind: "hint"; level: 1 | 2 | 3; target: RubricElement }
  | { kind: "summary"; unmet: RubricElement[] };

export function decideNext(rubric: Rubric, session: Session, d: Diagnosis): NextStep {
  if (isAchieved(rubric, d)) return { kind: "achieved" };

  // `확인필요`는 힌트로 풀 문제가 아니다. 확신이 없는 쪽은 우리이므로 우리가 묻는다.
  // 재설명 횟수를 소모하지 않는다. 학습자의 실패가 아니기 때문이다.
  // 다만 그래서 따로 세지 않으면 끝나지 않는다. 두 번까지만 묻고 힌트로 넘어간다.
  if (d.followUp && session.confirms < MAX_CONFIRMS) {
    return { kind: "confirm", question: d.followUp };
  }

  const unmet = unmetRequired(rubric, d);

  // 종료는 재설명 횟수 하나로만 판단한다. 힌트 단계까지 함께 조건에 넣으면,
  // 힌트 단계가 오르지 않는 경로(오개념 교정)에서 종료가 영영 성립하지 않는다.
  if (session.attempts >= MAX_RETRIES) return { kind: "summary", unmet };

  // 필수 요소는 다 말했는데 모순되는 진술이 남은 경우.
  // 교정 문장은 이미 화면에 있으므로 힌트를 새로 만들지 않고 다시 설명하게 한다.
  const target = pickHintTarget(rubric, d);
  if (!target) return { kind: "correct" };

  const level = Math.min(session.hintLevel + 1, 3) as 1 | 2 | 3;
  return { kind: "hint", level, target };
}

/** 학습자가 몇 번 더 설명할 수 있는지. 화면에 그대로 보여 준다. */
export function retriesLeft(session: Session): number {
  return Math.max(0, MAX_RETRIES - session.attempts);
}

/** 이전 진단과 비교해 이번에 달라진 요소. 재설명이 무엇을 바꿨는지 보여 준다. */
export function statesChanged(
  prev: Diagnosis | null,
  next: Diagnosis,
): { elementId: string; from: string; to: string }[] {
  if (!prev) return [];
  const changed = [];
  for (const n of next.elements) {
    const p = prev.elements.find((e) => e.elementId === n.elementId);
    if (p && p.state !== n.state) {
      changed.push({ elementId: n.elementId, from: p.state, to: n.state });
    }
  }
  return changed;
}
