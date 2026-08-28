import type { Diagnosis, Judgement, Rubric, Turn } from "./types";
import { requiredElements } from "./rubric";

/**
 * 2층 판정 (LLM-as-a-Judge).
 *
 * 1층은 학습자의 설명을 채점한다. 2층은 **그 진단 자체**를 채점한다.
 * 대상이 다르므로 필드의 뜻도 다르다 (PRD 12장).
 */
const SYSTEM = [
  "당신은 학습 진단기의 출력을 검사하는 채점자입니다. 진단을 다시 하지 말고 검사만 하세요.",
  "당신이 채점하는 것은 학습자의 설명이 아니라, 진단기가 내놓은 판정과 메시지입니다.",
  "",
  "아래 JSON 스키마로만 출력합니다. 설명 문장을 앞뒤에 붙이지 마세요.",
  "{",
  '  "grounded": boolean,  // 진단이 <루브릭> 요소와 <원문> 청크 안에서만 근거를 댔는가. 루브릭에 없는 기준을 지어냈으면 false.',
  '  "cited": boolean,     // 각 판정에 학습자 발화 구간(evidence)이 붙어 있는가. 오개념 교정에 청크 ID가 붙어 있는가.',
  '  "refusal": boolean,   // 자료 범위 밖 요청이나 정답 요구를 옳게 거절했는가. 범위 안 질문을 거절했으면 false.',
  '  "relevant": boolean,  // 학습자가 실제로 말한 것에 대한 진단인가. 말하지 않은 것을 지적했으면 false.',
  '  "complete": boolean,  // <루브릭>의 필수 요소를 하나도 빠뜨리지 않고 판정했는가.',
  '  "verdict": "pass" | "warn" | "fail",',
  '  "reason": string      // 한국어 한 문장.',
  "}",
  "",
  "판정 지침",
  "- **학습자를 채점하지 마세요.** 학습자가 무엇을 빠뜨렸는지는 당신의 관심사가 아닙니다.",
  "  당신이 볼 것은 진단기가 그 판정을 내릴 자격이 있었는가입니다.",
  "  나쁜 reason: \"학습자가 방향을 설명하지 않았습니다\" (학습자 채점)",
  "  좋은 reason: \"진단기가 클라이언트를 `이해`로 주었으나 학습자 발화에 주체가 없어 근거가 부족합니다\"",
  "- `grounded`: 진단기가 루브릭에 없는 항목을 평가했거나, <원문>에 없는 내용으로 교정했으면 false 입니다.",
  "- `cited`: evidence 가 비어 있는데 상태가 `이해`나 `부분`이면 false 입니다. `미도달`은 인용할 발화가 없는 것이 정상이므로 감점하지 않습니다.",
  "- `refusal`: 거절이 필요 없던 상황이면 false 가 정상입니다. 실패를 뜻하지 않습니다.",
  "- 거절한 턴에서는 `grounded`·`cited` 를 **거절 사유를 밝혔는가**로 보세요. 자료 범위 밖 거절이",
  "  유사도 수치와 다루는 개념을 제시했다면 둘 다 true 입니다. 정답 요구 거절이 왜 지금은 줄 수 없는지를",
  "  밝혔다면 역시 true 입니다. 거절에는 채점할 요소 판정이 없으므로 그 부재를 감점하지 마세요.",
  "- `complete`: 필수 요소 중 판정이 빠진 것이 있으면 false 입니다.",
  "- `verdict`: pass 는 근거에 충실하고 빠짐이 없을 때. warn 은 인용이 빠졌거나 일부 요소가 불완전할 때.",
  "  fail 은 루브릭 밖 기준을 만들었거나, 학습자가 말하지 않은 것을 지적했거나, 맞는 설명을 틀렸다고 했을 때입니다.",
  "- **맞는 설명을 틀렸다고 판정한 것을 발견하면 다른 필드가 좋아도 verdict 는 fail 입니다.** 초급 학습자에게",
  "  없던 오개념을 심는 일이라 비용이 가장 큽니다.",
].join("\n");

function describeDiagnosis(rubric: Rubric, d: Diagnosis): string {
  const els = d.elements
    .map((e) => {
      const name = rubric.elements.find((x) => x.id === e.elementId)?.name ?? e.elementId;
      return `- ${e.elementId} ${name}: ${e.state} | 근거발화: ${e.evidence || "(없음)"} | 사유: ${e.reason}`;
    })
    .join("\n");
  const mis = d.misconceptions.length
    ? d.misconceptions
        .map((m) => `- 오개념 "${m.quote}" → 교정: ${m.correction} [청크 ${m.chunkIds.join(",")}]`)
        .join("\n")
    : "- (없음)";
  return `${els}\n${mis}\n- 확인 질문: ${d.followUp ?? "(없음)"}`;
}

export function buildJudgeUser(turn: Turn, rubric: Rubric): string {
  const required = requiredElements(rubric)
    .map((e) => `- ${e.id} ${e.name}: ${e.criterion}`)
    .join("\n");

  const chunks = (turn.retrieval?.hits ?? [])
    .map((h) => `[${h.chunk.id}] ${h.chunk.text}`)
    .join("\n");

  const produced =
    turn.kind === "diagnosis" && turn.diagnosis
      ? `<진단기의 판정>\n${describeDiagnosis(rubric, turn.diagnosis)}\n</진단기의 판정>`
      : `<진단기의 메시지>\n${turn.message}\n</진단기의 메시지>`;

  const situation =
    turn.kind === "refusal"
      ? `상황: 진단기가 이 입력을 거절했습니다. 거절 사유는 ${
          turn.scope?.answerDemand ? "정답 요구" : `자료 범위 밖(최고 유사도 ${turn.scope?.topCosine.toFixed(3)})`
        } 입니다.`
      : turn.kind === "confirm"
        ? `상황: 진단기가 범위를 확신하지 못해 되물었습니다 (최고 유사도 ${turn.scope?.topCosine.toFixed(3)}).`
        : turn.kind === "hint"
          ? "상황: 진단기가 힌트를 제공했습니다. 정답을 직접 노출했는지 보세요."
          : turn.kind === "summary"
            ? "상황: 힌트가 소진되어 진단기가 정답 요약을 제공했습니다. 이 단계에서는 정답 제공이 정상입니다."
            : "상황: 진단기가 학습자의 설명을 루브릭으로 판정했습니다.";

  return [
    situation,
    "",
    "<루브릭 필수 요소>",
    required,
    "</루브릭 필수 요소>",
    "",
    "<원문>",
    chunks || "(검색된 청크 없음)",
    "</원문>",
    "",
    `<학습자의 입력>\n${turn.input}\n</학습자의 입력>`,
    "",
    produced,
  ].join("\n");
}

export const JUDGE_SYSTEM = SYSTEM;

const FALLBACK: Judgement = {
  grounded: false,
  cited: false,
  refusal: false,
  relevant: false,
  complete: false,
  verdict: "warn",
  reason: "판정 결과를 JSON으로 읽지 못했습니다.",
};

export function parseJudgement(raw: string): Judgement {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return { ...FALLBACK, reason: `판정 출력 파싱 실패: ${raw.slice(0, 100)}` };
  }
  try {
    const o = JSON.parse(raw.slice(start, end + 1)) as Partial<Judgement>;
    return {
      grounded: !!o.grounded,
      cited: !!o.cited,
      refusal: !!o.refusal,
      relevant: !!o.relevant,
      complete: !!o.complete,
      verdict: o.verdict === "pass" || o.verdict === "fail" ? o.verdict : "warn",
      reason: typeof o.reason === "string" ? o.reason : "",
    };
  } catch {
    return { ...FALLBACK, reason: `판정 출력 파싱 실패: ${raw.slice(0, 100)}` };
  }
}
