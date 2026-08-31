import { domain } from "../config/domain";
import { RUBRICS } from "./rubric";
import type { Chunk, RetrievalResult, Rubric, ScopeCheck, VectorStore } from "./types";

/**
 * 거절·확인·원문 요약은 모델을 거치지 않고 만든다.
 *
 * 이 세 자리에서 모델을 쓰면 정답이 새거나(Risk 4) 문구가 매번 흔들린다.
 * 내용이 정해져 있는 말은 정해진 대로 하는 편이 낫다.
 */

const conceptList = () => RUBRICS.map((r) => `“${r.title}”`).join(", ");

/** F8 — 자료 범위 밖. 왜 밖인지의 근거를 함께 남긴다. */
export function refusalMessage(scope: ScopeCheck): string {
  if (scope.answerDemand) {
    return [
      "지금은 답을 알려 드리지 않습니다.",
      "이 도구는 설명을 대신 해 주는 것이 아니라, 여러분이 설명해 본 다음 무엇이 비었는지 되돌려 주는 곳이라서요.",
      "힌트를 세 단계까지 받고도 닿지 않으면 그때는 정리해서 알려 드립니다.",
      "",
      "아는 만큼만 적어 보세요. 틀려도 괜찮습니다. 무엇이 비었는지 알려 드리는 것이 제 일입니다.",
    ].join("\n");
  }

  return [
    `이 질문은 지금 다루는 자료의 범위 밖입니다. 유사도가 ${scope.topCosine.toFixed(3)}으로 기준(${domain.retrieval.scope.ask}) 아래입니다.`,
    "답을 지어내는 대신 답할 수 없다고 말씀드립니다.",
    "",
    `제가 점검할 수 있는 개념은 ${conceptList()} 입니다.`,
  ].join("\n");
}

/** F8 — 확인 구간. 단정하지 않고 되묻는다 (원칙 7). */
export function confirmMessage(scope: ScopeCheck): string {
  const near = scope.nearest;
  return [
    `말씀하신 내용이 제가 가진 자료와 맞닿는 것 같기는 한데 확신이 서지 않습니다. (유사도 ${scope.topCosine.toFixed(3)})`,
    near ? `가장 가까운 자료는 “${near.section}” 쪽입니다.` : "",
    "",
    `혹시 ${conceptList()} 중 하나에 대한 이야기인가요? 맞다면 그 개념에 대해 아는 만큼 설명해 주세요.`,
    "아니라면 지금 자료로는 도와드리기 어렵습니다.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * F0 — 원문 링크와 요약.
 *
 * 요약을 모델에게 쓰게 하지 않고 청크를 그대로 고른다. 그러면 요약이
 * 원문을 벗어날 방법이 구조적으로 없다.
 */
export function sourceSummary(
  rubric: Rubric,
  store: VectorStore | null,
  lines = 4,
): { chunks: Chunk[]; sections: { name: string; url: string }[] } {
  if (!store) return { chunks: [], sections: [] };

  // 청크를 개념 제목으로 찾으면 안 된다. "CSS 박스 모델"의 첫 낱말은 "CSS"인데
  // 섹션 이름은 "박스 모델 · 여백"이라 하나도 걸리지 않았다. 읽기 화면이
  // 통째로 비어 있었는데 측정은 이 함수를 쓰지 않아 드러나지 않았다.
  // 원문 주소로 맞춘다. 청크가 어느 문서에서 왔는지가 유일하게 확실한 표시다.
  const base = rubric.source.url.split("#")[0];
  const mine = store.chunks.filter((c) => c.url.split("#")[0] === base);

  const sections: { name: string; url: string }[] = [];
  for (const c of mine) {
    if (!sections.some((s) => s.url === c.url)) sections.push({ name: c.section, url: c.url });
  }

  // 각 섹션의 첫 청크를 개요로 삼는다. 섹션의 첫 문장이 대개 그 섹션의 주제문이다.
  const seen = new Set<string>();
  const chunks: Chunk[] = [];
  for (const c of mine) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    chunks.push(c);
    if (chunks.length >= lines) break;
  }

  return { chunks, sections };
}

/**
 * 청크를 프롬프트에 싣는 형식.
 *
 * 본문만 넘기면 모델이 무엇을 근거로 삼았는지 되짚을 수 없다. ID 와 함께
 * 섹션과 출처 주소까지 실어 보내, 교정 문장이 어느 문단에서 나왔는지
 * 화면까지 이어지게 한다. (과제 요구: ID·URL·섹션 정보를 잃지 않고 전달)
 */
export function evidenceBlock(retrieval: RetrievalResult): string {
  return retrieval.hits
    .map((h) => `[${h.chunk.id}] (${h.chunk.section} · ${h.chunk.url})\n${h.chunk.text}`)
    .join("\n\n");
}
