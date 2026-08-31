import type { ElementState, Rubric, RubricElement } from "./types";

/* ══ 이의 제기 (PRD 원칙 8, F1) ═══════════════════════════════════════
   진단이 틀릴 수 있다. 그런데 **초급 학습자는 판정 이유를 검증할 능력이
   없다**(Risk 2). 그래서 이유를 보여 주는 것만으로는 부족하고, 아니라고
   말할 자리가 있어야 한다.

   다만 이 자리가 채점을 우회하는 통로가 되면 안 된다. 그래서 기준을 하나로
   좁힌다. **원래 설명 안에 이미 그 뜻이 있었는가.**

     있었다  → 진단이 틀린 것이다. 판정을 고친다.
     없었다  → 지금 새로 말한 것이다. 이의가 아니라 재설명이다.

   받아들일 때는 원래 발화에서 근거 구간을 대야 하고, 그 구간이 실제로
   학습자의 말인지 코드가 다시 확인한다. 요소 판정에 쓰는 검사와 같다.
   ═══════════════════════════════════════════════════════════════════ */

/** 한 턴에 받을 이의의 상한. 없으면 모든 요소에 이의를 걸어 달성으로 밀 수 있다. */
export const MAX_APPEALS_PER_TURN = 2;

export type AppealOutcome = {
  accepted: boolean;
  /** 받아들였을 때, 원래 설명에서 그 뜻을 담은 구간 */
  quote: string;
  /** 학습자에게 보일 한 문장 */
  reason: string;
  /** 코드 검사에서 되돌린 경우의 사유. 기록용 */
  overturned: string | null;
};

export function buildAppealSystem(rubric: Rubric, target: RubricElement): string {
  return [
    `학습자가 "${rubric.title}" 진단 중 한 요소의 판정에 이의를 제기했습니다.`,
    "판정이 틀렸는지 다시 보고, 학습자에게 한 문장으로 답하세요.",
    "",
    `이의가 걸린 요소: ${target.name}`,
    `그 요소의 판정 기준: ${target.criterion}`,
    "",
    "판단 기준은 하나입니다.",
    "**<원래 설명> 안에 이미 그 뜻이 있었는가.**",
    "",
    "- 있었다면 accepted 는 true 입니다. 진단이 놓친 것입니다.",
    "  quote 에 <원래 설명>에서 그 뜻을 담은 구간을 **글자 그대로** 옮기세요.",
    "  **그 구간만 따로 떼어 읽어도 판정 기준을 만족해야 합니다.**",
    "  전체 설명을 다 읽어야 겨우 그렇게 읽히는 정도면 accepted 는 false 입니다.",
    "- <해명>에서 처음 나온 내용이라면 accepted 는 false 입니다.",
    "  그것은 이의가 아니라 새로운 설명이므로, 다시 설명해 보라고 안내하세요.",
    "",
    "주의",
    "- <해명>은 <원래 설명>의 말이 무슨 뜻이었는지 알려 주는 용도로만 읽습니다.",
    "  해명이 맞는 말이어도, 원래 설명에 그 뜻이 없었다면 accepted 는 false 입니다.",
    "- 표현이 달라도 의미가 같으면 있었던 것으로 봅니다. 전문 용어를 쓰지 않았다고 없는 것이 아닙니다.",
    "- **애매하면 학습자 쪽으로 기울이세요.** 맞는 설명을 틀렸다고 하는 비용이 더 큽니다.",
    "- reason 은 학습자에게 건네는 한 문장입니다. 3인칭으로 부르지 마세요.",
    "",
    "아래 JSON 으로만 답하세요.",
    '{"accepted": true, "quote": "원래 설명에서 그대로", "reason": "한 문장"}',
  ].join("\n");
}

export function buildAppealUser(original: string, rebuttal: string, currentState: ElementState) {
  return [
    `<원래 설명>\n${original}\n</원래 설명>`,
    "",
    `<진단이 내린 상태>\n${currentState}\n</진단이 내린 상태>`,
    "",
    `<해명>\n${rebuttal}\n</해명>`,
  ].join("\n");
}

const norm = (s: string) => s.replace(/[\s.,!?"'“”‘’·…()[\]{}]/g, "").toLowerCase();

/**
 * 이의를 받아들일지 최종 결정한다.
 *
 * 모델이 받아들였다 해도, 근거 구간이 원래 설명에 실제로 없으면 되돌린다.
 * 없는 말을 근거로 판정을 뒤집으면 그것은 채점이 아니라 봐주기가 된다.
 */
export function parseAppeal(raw: string, original: string): AppealOutcome {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return {
      accepted: false,
      quote: "",
      reason: "다시 살펴봤는데 판단이 어려웠어요. 조금만 더 풀어서 설명해 주시겠어요?",
      overturned: "이의 판정을 JSON으로 읽지 못함",
    };
  }

  let o: { accepted?: unknown; quote?: unknown; reason?: unknown };
  try {
    o = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return {
      accepted: false,
      quote: "",
      reason: "다시 살펴봤는데 판단이 어려웠어요. 조금만 더 풀어서 설명해 주시겠어요?",
      overturned: "이의 판정 JSON 파싱 실패",
    };
  }

  const quote = typeof o.quote === "string" ? o.quote : "";
  const reason = typeof o.reason === "string" && o.reason.trim() ? o.reason.trim() : "";
  const wanted = o.accepted === true;

  if (wanted) {
    const inOriginal = norm(quote).length > 1 && norm(original).includes(norm(quote));
    if (!inOriginal) {
      return {
        accepted: false,
        quote: "",
        reason:
          "말씀하신 내용은 맞아요. 다만 그 뜻이 원래 설명에는 아직 없었어요. 그 부분을 넣어서 한 번만 더 말해 주시겠어요?",
        overturned: `받아들이려 했으나 근거 구간이 원래 설명에 없음: "${quote.slice(0, 40)}"`,
      };
    }
    return {
      accepted: true,
      quote,
      reason: reason || "다시 보니 말씀이 맞네요. 판정을 고쳤어요.",
      overturned: null,
    };
  }

  return {
    accepted: false,
    quote: "",
    reason: reason || "원래 설명에서는 그 뜻을 찾지 못했어요. 그 부분을 넣어 다시 말해 주시겠어요?",
    overturned: null,
  };
}
