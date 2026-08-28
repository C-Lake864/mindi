import httpRubric from "../../data/rubrics/http.json";
import boxModelRubric from "../../data/rubrics/box-model.json";
import type { Diagnosis, Rubric, RubricElement } from "./types";

/**
 * 루브릭은 빌드에 함께 묶는다.
 *
 * 청크(chunks.json)와 달리 런타임에 내려받지 않는 이유는, 루브릭이 없으면
 * 이 제품이 아예 성립하지 않기 때문이다. 판정 기준이 네트워크 실패로
 * 사라질 수 있는 자리에 있으면 안 된다.
 */
export const RUBRICS: Rubric[] = [httpRubric as Rubric, boxModelRubric as Rubric];

export function getRubric(id: string): Rubric | undefined {
  return RUBRICS.find((r) => r.id === id);
}

export function requiredElements(rubric: Rubric): RubricElement[] {
  return rubric.elements.filter((e) => e.required);
}

export function elementById(rubric: Rubric, id: string): RubricElement | undefined {
  return rubric.elements.find((e) => e.id === id);
}

/** 원문의 해당 섹션으로 바로 가는 링크. */
export function anchorUrl(rubric: Rubric, anchor: string): string {
  return rubric.source.url.split("#")[0] + anchor;
}

/**
 * PRD 3장 성공 상태: 필수 요소 전체가 `이해` 이고 오개념이 없을 것.
 *
 * 이 판단은 흐름 제어에만 쓰고 등급으로 노출하지 않는다.
 */
export function isAchieved(rubric: Rubric, d: Diagnosis | null): boolean {
  if (!d) return false;
  if (d.misconceptions.length > 0) return false;
  return requiredElements(rubric).every(
    (e) => d.elements.find((v) => v.elementId === e.id)?.state === "이해",
  );
}

/** 아직 `이해`에 이르지 못한 필수 요소. 힌트는 이 중 하나를 겨눈다. */
export function unmetRequired(rubric: Rubric, d: Diagnosis | null): RubricElement[] {
  if (!d) return requiredElements(rubric);
  return requiredElements(rubric).filter(
    (e) => d.elements.find((v) => v.elementId === e.id)?.state !== "이해",
  );
}

/**
 * 힌트가 겨눌 요소 하나를 고른다.
 *
 * 오개념이 있으면 그것이 충돌하는 요소를 먼저 잡는다. 오개념은 "안다"고
 * 느끼는 상태라 방치 비용이 크기 때문이다 (원칙 5).
 * 그다음은 `미도달`, 그다음이 `부분`이다. `확인필요`는 힌트가 아니라
 * 되묻기로 처리하므로 여기서 고르지 않는다.
 */
export function pickHintTarget(rubric: Rubric, d: Diagnosis | null): RubricElement | null {
  const required = requiredElements(rubric);
  const unmet = unmetRequired(rubric, d);
  if (!d) return unmet[0] ?? null;

  const conflicted = new Set(
    d.misconceptions.flatMap((m) => {
      const known = rubric.misconceptions.find((x) => x.id === m.misconceptionId);
      return known?.conflictsWith ?? [];
    }),
  );

  // 오개념이 충돌하는 요소를 먼저 잡는다. 그 요소가 이미 `이해`여도 마찬가지다.
  // 필수 요소를 모두 말했더라도 모순되는 진술이 있으면 개념은 끝나지 않는다.
  const conflictTarget = required.find((e) => conflicted.has(e.id));
  if (conflictTarget) return conflictTarget;

  const stateOf = (id: string) => d.elements.find((v) => v.elementId === id)?.state;
  return unmet.find((e) => stateOf(e.id) === "미도달") ?? unmet[0] ?? null;
}
