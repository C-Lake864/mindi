import type { RetrievalResult, Rubric, RubricElement } from "./types";
import { anchorUrl } from "./rubric";

export type HintLevel = 1 | 2 | 3;

/* ══ 왜 힌트도 JSON 으로 받는가 ═══════════════════════════════════════
   사고형 모델의 추론을 끄는 방법을 세 가지 시도했다.

     think: false      → 이 Ollama 빌드가 무시한다
     /no_think 스위치  → 시스템 프롬프트가 있으면 듣지 않는다(영어 4,135자)
     format: "json"    → 사고가 나올 자리가 없어진다

   앞의 둘은 부탁이고 마지막은 구조다. 그래서 힌트와 요약도 JSON 으로 받는다.
   스트리밍은 포기한다. 두 문장짜리 힌트에 스트리밍은 값어치가 없고,
   무엇보다 검증되지 않은 텍스트를 화면에 흘리면 안 된다.
   ═══════════════════════════════════════════════════════════════════ */

const LEVEL_RULES: Record<HintLevel, string[]> = {
  1: [
    "방향만 가리키세요. 무엇을 생각해 봐야 하는지만 말합니다.",
    "**금지**: 요소의 이름을 말하지 마세요. 판정 기준의 문장을 옮기지 마세요.",
    "예: \"브라우저가 서버에 먼저 무엇인가를 보낸다는 점을 생각해 보세요.\"",
  ],
  2: [
    "관련 개념의 이름까지만 알려 주세요.",
    "**금지**: 그 개념이 무엇인지 설명하지 마세요. 정의를 주면 인출할 것이 남지 않습니다.",
    "예: \"이 통신에는 요청과 응답이라는 두 개념이 있어요. 둘의 방향을 생각해 보세요.\"",
  ],
  3: [
    "원문의 해당 문단을 그대로 인용하고, 어디를 보라고만 안내하세요.",
    "**금지**: 원문을 요약하거나 해석해 주지 마세요. 읽고 스스로 말하게 둡니다.",
    "인용할 원문은 <원문> 안에 있습니다. 목표 요소에 해당하는 것만 쓰세요.",
  ],
};

export function buildHintSystem(rubric: Rubric, target: RubricElement, level: HintLevel): string {
  return [
    `당신은 "${rubric.title}"을 공부하는 사람 옆에서 힌트를 주는 사람입니다.`,
    "",
    `학습자가 아직 말하지 못한 것: ${target.name}`,
    `(그 요소의 기준: ${target.criterion})`,
    "",
    `힌트 단계 ${level}/3`,
    ...LEVEL_RULES[level].map((s) => `- ${s}`),
    "",
    "공통 규칙",
    "- 완성된 설명을 대신 써 주지 마세요. 스스로 고칠 수 있을 만큼만 줍니다.",
    "- **한국어로 두 문장 이내.** 부드러운 말씨로 씁니다.",
    "- 평가하거나 다그치는 말투를 쓰지 마세요.",
    "",
    "**hint 값은 학습자에게 직접 건네는 말 그 자체입니다.**",
    "- 학습자를 \"학습자\"라고 3인칭으로 부르지 마세요. 눈앞의 사람에게 말하듯 씁니다.",
    "- 어떤 힌트를 줄지 궁리한 과정을 쓰지 마세요. 결과 문장만 씁니다.",
    "- \"~하는 것이 좋습니다\", \"~를 강조해야 합니다\", \"예시 문장:\" 같은 말이 들어가면 잘못된 것입니다.",
    "",
    "나쁜 예 (생각 과정을 그대로 씀)",
    '{"hint": "학습자가 서버를 언급하지 않았으므로 요청을 받는 주체라는 점을 강조해야 합니다. 예시 문장: ..."}',
    "좋은 예 (건네는 말)",
    '{"hint": "요청을 보내는 쪽은 말씀하셨네요. 그럼 그 요청을 받아서 답해 주는 쪽은 누구일까요?"}',
    "",
    "아래 JSON 으로만 답하세요. 다른 말을 앞뒤에 붙이지 마세요.",
    '{"hint": "여기에 학습자에게 건넬 한국어 두 문장 이내"}',
  ].join("\n");
}

export function buildHintUser(
  explanation: string,
  target: RubricElement,
  level: HintLevel,
  retrieval: RetrievalResult,
  rubric: Rubric,
): string {
  const parts = [`<학습자의 설명>\n${explanation}\n</학습자의 설명>`];

  if (level === 3) {
    // Hint 3 에서만 원문을 넘긴다. 1·2단계에 원문을 주면 반드시 새어 나온다.
    const evidence = retrieval.hits.map((h) => `[${h.chunk.id}] ${h.chunk.text}`).join("\n");
    parts.push("", "<원문>", evidence, "</원문>", "", `참고 링크: ${anchorUrl(rubric, target.anchor)}`);
  }

  parts.push("", `목표 요소: ${target.name}`);
  return parts.join("\n");
}

/**
 * 소진 종료 시의 정답 요약. 여기서만 정답을 준다.
 * 이 규칙이 없으면 무한 루프가 되고, 그 지점이 좌절 이탈의 최대 구간이다.
 */
export function buildSummarySystem(rubric: Rubric, unmet: RubricElement[]): string {
  const body = unmet.length
    ? ["아직 닿지 못한 것", ...unmet.map((e) => `- ${e.name}: ${e.criterion}`)]
    : ["필수 요소는 다 말했지만 어긋나는 진술이 남아 있습니다. 무엇이 어긋났는지 짚어 주세요."];

  return [
    `학습자가 "${rubric.title}"을 여러 번 다시 설명했지만 아직 닿지 못한 부분이 있습니다.`,
    "이제는 알려 줄 차례입니다. 힌트가 아니라 설명을 제공하세요.",
    "",
    ...body,
    "",
    "규칙",
    "- 위 내용만 설명하세요. 이미 이해한 것을 다시 설명하지 마세요.",
    "- 각 항목을 한두 문장으로. 전체 네 문장을 넘기지 마세요.",
    "- <원문>에 있는 내용만 쓰고, 쓴 청크 ID를 [MD-001] 형태로 문장 끝에 붙이세요.",
    "- 마지막에 다시 볼 항목으로 남겨 두었다는 취지의 한 문장을 덧붙이세요.",
    "- 학습자를 탓하거나 평가하지 마세요.",
    "",
    "**summary 값은 학습자에게 직접 건네는 말 그 자체입니다.**",
    "학습자를 3인칭으로 부르지 말고, 어떻게 쓸지 궁리한 과정도 쓰지 마세요.",
    "",
    "아래 JSON 으로만 답하세요.",
    '{"summary": "여기에 학습자에게 건넬 한국어 네 문장 이내"}',
  ].join("\n");
}

export function buildSummaryUser(explanation: string, retrieval: RetrievalResult): string {
  const evidence = retrieval.hits.map((h) => `[${h.chunk.id}] ${h.chunk.text}`).join("\n");
  return [
    `<학습자의 마지막 설명>\n${explanation}\n</학습자의 마지막 설명>`,
    "",
    "<원문>",
    evidence,
    "</원문>",
  ].join("\n");
}

/**
 * 3인칭 호칭을 걷어낸다.
 *
 * 프롬프트에서 두 번 못박아도 "학습자가 요청을 보내는 쪽을 말했네요"처럼
 * 앞머리에 붙어 나온다. 눈앞의 사람을 3인칭으로 부르는 말투가 바로
 * "채점당하는 기분"을 만드는 자리라, 문장 앞에서만 조용히 지운다.
 * 문장 중간은 건드리지 않는다. 어색하게 잘릴 위험이 더 크다.
 */
function humanize(text: string): string {
  return text
    .replace(/(^|[.!?]\s+)학습자(가|는|께서|님이|님은|님께서)\s*/g, "$1")
    .replace(/(^|[.!?]\s+)사용자(가|는|께서)\s*/g, "$1")
    .trim();
}

/**
 * JSON 한 겹을 벗긴다.
 *
 * format:"json" 을 줘도 모델이 키 이름을 바꾸거나 한 겹 더 감싸는 일이 있어,
 * 원하는 키가 없으면 문자열 값 중 가장 긴 것을 집는다. 그래도 없으면
 * 빈 문자열을 준다. 영어 추론을 화면에 흘리는 것보다 아무것도 안 보여 주는
 * 편이 낫다.
 */
export function parseText(raw: string, key: string): string {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return "";
  try {
    const obj = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const direct = obj[key];
    if (typeof direct === "string" && direct.trim()) return humanize(direct);

    const strings = Object.values(obj).filter(
      (v): v is string => typeof v === "string" && v.trim().length > 0,
    );
    const longest = strings.sort((a, b) => b.length - a.length)[0];
    return longest ? humanize(longest) : "";
  } catch {
    return "";
  }
}
