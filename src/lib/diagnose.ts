import type { Diagnosis, ElementState, MisconceptionHit, RetrievalResult, Rubric } from "./types";

const STATES: ElementState[] = ["이해", "부분", "확인필요", "미도달"];

/* ══ 1단계: 판정 ══════════════════════════════════════════════════════
   이 호출에는 <원문>을 넣지 않는다.

   처음에는 판정과 교정을 한 번에 시켰고, 프롬프트로 "원문은 판정에 쓰지
   말라"고 적어 두었다. 지키지 않았다. 모델은 원문 청크의 문장을 학습자
   발화로 인용했고, 화면에는 그것이 "내가 쓴 말"로 표시됐다.

   부탁으로 지켜지지 않는 경계는 구조로 만든다. 판정 호출은 루브릭과
   학습자 발화만 본다. 원문은 2단계에만 들어간다 (PRD 7.1).
   ═══════════════════════════════════════════════════════════════════ */

export function buildDiagnosisSystem(rubric: Rubric): string {
  const elements = rubric.elements
    .map((e) => `- ${e.id} | ${e.name} | ${e.required ? "필수" : "선택"} | 판정 기준: ${e.criterion}`)
    .join("\n");

  const misconceptions = rubric.misconceptions.map((m) => `- ${m.id} | ${m.statement}`).join("\n");

  return [
    "당신은 학습자의 설명을 채점하는 진단기입니다. 설명을 대신 써 주지 말고 판정만 하세요.",
    "정답을 알려주지 마세요. 무엇이 비었는지만 알려 줍니다.",
    "",
    `개념: ${rubric.title}`,
    `정의: ${rubric.definition}`,
    "",
    "<루브릭>",
    elements,
    "</루브릭>",
    "",
    "<알려진 오개념>",
    misconceptions || "(없음)",
    "</알려진 오개념>",
    "",
    "판정 규칙",
    "1. 판정 기준은 오직 <루브릭>입니다. 루브릭에 없는 항목은 평가하지 마세요.",
    "2. 표현이 달라도 의미가 같으면 `이해`입니다. 루브릭 문장과의 일치는 기준이 아닙니다.",
    "3. 상태는 넷 중 하나입니다.",
    "   - `이해`: 해당 요소의 핵심 의미가 학습자 발화에 명시적으로 있다",
    "   - `부분`: 언급은 있으나 핵심 의미가 불완전하다",
    "   - `확인필요`: 학습자 표현이 이 요소를 뜻하는지 확신이 낮다",
    "   - `미도달`: 해당 요소가 나타나지 않는다",
    "4. **확신이 낮으면 `미도달`이 아니라 `확인필요`로 두세요.** 맞는 설명을 틀렸다고 하는 것은",
    "   초급 학습자에게 없던 오개념을 심는 일이라, 놓치는 것보다 비용이 큽니다.",
    "5. **evidence 는 <학습자의 설명> 안에 글자 그대로 있는 구간이어야 합니다.**",
    "   한 글자도 바꾸지 말고 복사하세요. 다듬거나 정리하지 마세요.",
    "   `미도달`이면 evidence 는 빈 문자열입니다. 인용할 발화가 없어서 미도달인 것입니다.",
    "6. **추정으로 채우지 마세요.** 요소가 어떤 주체나 개념의 이름을 요구하는데 학습자가 그 말을",
    "   실제로 쓰지 않았다면 `이해`가 아닙니다. \"문맥상 암시했다\"는 근거가 되지 않습니다.",
    "   예: \"요청을 보내면 응답이 옵니다\"라고만 썼다면 누가 보내고 누가 답하는지는 말하지",
    "   않은 것입니다. 클라이언트와 서버 요소는 `이해`가 아닙니다.",
    "7. 오개념은 루브릭의 요소와 **모순되는** 진술일 때만 잡습니다. 빠뜨린 것은 오개념이 아닙니다.",
    "   **대부분의 설명에는 오개념이 없습니다. 빈 배열이 정상이고 가장 흔한 답입니다.**",
    "   맞는 말을 오개념으로 잡으면 학습자에게 없던 오개념을 심게 됩니다. 확신이 없으면 잡지 마세요.",
    "   quote 에는 모순되는 그 발화를 <학습자의 설명>에서 글자 그대로 옮기고,",
    "   contradicts 에는 그 발화가 어긋나는 루브릭 요소의 ID를 정확히 하나 적으세요.",
    "   그 요소를 방금 `이해`로 판정했다면 모순이 아닙니다. 잡지 마세요.",
    "8. <루브릭>의 모든 요소를 빠짐없이 판정하세요. 선택 요소도 포함합니다.",
    "",
    "아래 JSON 형식으로만 출력하세요. 설명 문장을 앞뒤에 붙이지 마세요.",
    "{",
    '  "elements": [{"elementId": "...", "state": "이해|부분|확인필요|미도달", "evidence": "...", "reason": "한 문장"}],',
    '  "misconceptions": [{"misconceptionId": "MC-... 또는 null", "contradicts": "RB-...", "quote": "학습자 발화 그대로", "why": "무엇과 모순되는지"}]',
    "}",
  ].join("\n");
}

export function buildDiagnosisUser(explanation: string, previous: Diagnosis | null): string {
  const prior = previous
    ? [
        "<직전 판정>",
        previous.elements.map((e) => `${e.elementId}: ${e.state}`).join(", "),
        "학습자가 힌트를 받고 다시 설명했습니다. 이번 설명만을 근거로 새로 판정하세요.",
        "</직전 판정>",
        "",
      ].join("\n")
    : "";

  return [prior, "<학습자의 설명>", explanation, "</학습자의 설명>"].join("\n");
}

/* ══ 2단계: 오개념 교정 ═══════════════════════════════════════════════
   1단계가 모순을 찾았을 때만 부른다. 여기서만 <원문>이 들어간다.
   교정 문장은 모델의 지식이 아니라 청크에 근거해야 하고(Risk 6),
   그 청크 ID가 화면에 남는다. 이것이 `grounded`·`cited`의 근거다.
   ═══════════════════════════════════════════════════════════════════ */

export function buildCorrectionSystem(rubric: Rubric): string {
  return [
    `학습자가 "${rubric.title}"을 설명하면서 자료와 어긋나는 말을 했습니다.`,
    "무엇이 어긋났는지 <원문>에 근거해 짧게 바로잡아 주세요.",
    "",
    "규칙",
    "- 교정 문장은 <원문>에 있는 내용만으로 쓰세요. 원문에서 근거를 찾지 못하면 그 항목은 빼세요.",
    "- 각 교정에 사용한 청크 ID를 chunkIds 에 남기세요. 목록에 없는 ID를 쓰지 마세요.",
    "- 한 문장으로 씁니다. 개념 전체를 설명하지 마세요.",
    "- 학습자를 탓하지 마세요.",
    "",
    "아래 JSON 형식으로만 출력하세요.",
    '{ "corrections": [{"quote": "받은 발화 그대로", "correction": "한 문장", "chunkIds": ["MD-..."]}] }',
  ].join("\n");
}

export function buildCorrectionUser(
  quotes: { quote: string; why: string }[],
  retrieval: RetrievalResult,
): string {
  const evidence = retrieval.hits.map((h) => `[${h.chunk.id}] ${h.chunk.text}`).join("\n");
  return [
    "<원문>",
    evidence,
    "</원문>",
    "",
    "<바로잡을 발화>",
    ...quotes.map((q, i) => `${i + 1}. "${q.quote}" — ${q.why}`),
    "</바로잡을 발화>",
  ].join("\n");
}

/* ── 파싱 ──────────────────────────────────────────────────────────── */

function firstObject(raw: string): unknown | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** 공백과 문장부호를 지우고 비교한다. 모델이 인용하며 띄어쓰기를 바꾸기 때문이다. */
const norm = (s: string) => s.replace(/[\s.,!?"'“”‘’·…()[\]{}]/g, "").toLowerCase();

/**
 * 인용이 학습자가 실제로 쓴 말인가.
 *
 * 1단계에서 원문을 빼도 모델은 루브릭 문장을 인용할 수 있다.
 * 화면에 "내가 쓴 말"로 표시되는 값이므로 여기서 한 번 더 막는다.
 */
function quotedFromLearner(quote: string, learnerText: string): boolean {
  const q = norm(quote);
  if (q.length < 2) return false;
  return norm(learnerText).includes(q);
}

type LooseElement = { elementId?: unknown; state?: unknown; evidence?: unknown; reason?: unknown };
type LooseMisc = {
  misconceptionId?: unknown;
  contradicts?: unknown;
  quote?: unknown;
  why?: unknown;
};

export type DiagnosisDraft = {
  elements: Diagnosis["elements"];
  /** 교정 문장이 아직 없는 오개념 후보. 2단계로 넘긴다. */
  candidates: { misconceptionId: string | null; quote: string; why: string; targets: string[] }[];
  followUp: string | null;
};

export function parseDiagnosis(raw: string, rubric: Rubric, learnerText: string): DiagnosisDraft {
  const obj = firstObject(raw) as
    | { elements?: LooseElement[]; misconceptions?: LooseMisc[] }
    | null;

  const reported = new Map<string, LooseElement>();
  for (const e of obj?.elements ?? []) {
    const id = str(e.elementId);
    if (id) reported.set(id, e);
  }

  const elements = rubric.elements.map((el) => {
    const got = reported.get(el.id);
    let state: ElementState = STATES.includes(str(got?.state) as ElementState)
      ? (str(got?.state) as ElementState)
      : "확인필요";
    let evidence = state === "미도달" ? "" : str(got?.evidence);
    let reason = got
      ? str(got.reason)
      : "진단기가 이 요소를 판정하지 않았습니다. 단정하지 않고 확인이 필요합니다.";

    // 인용이 학습자의 말이 아니면 그 판정은 근거가 없다.
    // 틀렸다고 단정하지 않고 `확인필요`로 내린다(원칙 7). 되묻기로 이어진다.
    if (evidence && !quotedFromLearner(evidence, learnerText)) {
      state = "확인필요";
      evidence = "";
      reason = "진단기가 든 근거가 학습자의 실제 발화에 없어 이 판정은 보류합니다.";
    }

    return { elementId: el.id, state, evidence, reason };
  });

  /**
   * 한 구간이 여러 요소의 근거일 수는 없다.
   *
   * "요청을 보내면 응답이 옵니다" 한 문장을 클라이언트·서버·요청·응답·시작
   * 주체 다섯 요소의 근거로 동시에 대는 일이 있었다. 그 문장에는 누가 보내고
   * 누가 받는지가 없다. 프롬프트에 이 문장을 예시로 들어 금지해 두었는데도
   * 그대로 했다. 부탁으로 안 되는 것은 여기서 센다.
   *
   * 틀렸다고 하지 않고 `확인필요`로 내린다. 실제로 맞게 말했는데 진단기가
   * 인용을 게을리했을 수도 있어, 단정하는 대신 되묻는 쪽을 고른다(원칙 7).
   */
  const reuse = new Map<string, number>();
  for (const e of elements) {
    if (!e.evidence) continue;
    const k = norm(e.evidence);
    reuse.set(k, (reuse.get(k) ?? 0) + 1);
  }
  for (const e of elements) {
    if (e.evidence && (reuse.get(norm(e.evidence)) ?? 0) >= 3) {
      e.state = "확인필요";
      e.evidence = "";
      e.reason = "같은 한 구간을 여러 요소의 근거로 들어 이 판정은 보류합니다.";
    }
  }

  /**
   * 오개념이 진단기 자신의 요소 판정과 앞뒤가 맞는가.
   *
   * 측정에서 드러난 것: 오개념 탐지가 사실상 상수였다. 16건 중 13건에 오개념이
   * 붙었고, 정답 문장("여백은 박스 바깥 공간이라 크기 계산에 들어가지 않아요")까지
   * 잡혔다. 그런데 같은 진단에서 그 요소는 `이해`였다. 진단기가 자기 판정과
   * 모순된 것이다.
   *
   * 그래서 모순 대상을 명시하게 하고, 그 요소를 방금 `이해`로 준 오개념은 버린다.
   * 학습자가 어떤 요소를 제대로 설명했다면, 같은 설명이 그 요소와 모순될 수 없다.
   */
  const stateOf = (id: string) => elements.find((e) => e.elementId === id)?.state;

  const seen = new Set<string>();
  const candidates = (obj?.misconceptions ?? [])
    .map((m) => {
      const declared = str(m.contradicts);
      const known = rubric.misconceptions.find((x) => x.id === str(m.misconceptionId));
      // 모델이 지목한 요소와 루브릭이 미리 적어 둔 충돌 요소를 함께 본다.
      const targets = [...new Set([declared, ...(known?.conflictsWith ?? [])])].filter(
        (id) => id && rubric.elements.some((e) => e.id === id),
      );
      return {
        misconceptionId: str(m.misconceptionId) || null,
        quote: str(m.quote),
        why: str(m.why),
        targets,
      };
    })
    // 무엇과 모순되는지 대지 못하면 검증할 수 없다.
    .filter((m) => m.targets.length > 0)
    // 모순은 그 요소를 실제로 틀렸다고 본 경우에만 성립한다.
    // `이해`면 앞뒤가 맞지 않고, `확인필요`면 아직 확신이 없다는 뜻이므로
    // 그것을 근거로 모순을 주장할 수 없다(원칙 7). 둘 다 버린다.
    .filter((m) => m.targets.some((id) => stateOf(id) === "미도달" || stateOf(id) === "부분"))
    // 학습자가 하지 않은 말을 오개념으로 잡으면 없던 오개념을 심는 일이 된다(Risk 2).
    .filter((m) => quotedFromLearner(m.quote, learnerText))
    // 같은 발화에 여러 교정을 붙이는 일이 잦다. 하나만 남긴다.
    .filter((m) => {
      const key = norm(m.quote);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);

  // 되묻는 말은 모델에게 맡기지 않는다.
  // 맡겼더니 "클라이언트와 서버가 어떤 방식으로 통신하는지…"처럼 빠진 요소의
  // 이름을 그대로 말해 버렸다. 힌트 2단계에서야 할 일을 되묻기가 먼저 해 버리면
  // 인출할 것이 남지 않는다. 내용이 정해진 말은 정해진 대로 한다.
  const hasUnsure = elements.some((e) => e.state === "확인필요");

  return {
    elements,
    candidates,
    followUp: hasUnsure ? FOLLOW_UP : null,
  };
}

/** 어떤 개념에서도 정답을 흘리지 않는 되묻기 한 문장. */
const FOLLOW_UP =
  "방금 하신 말씀만으로는 제가 확실히 못 알아들었어요. 조금만 더 풀어서 말씀해 주실 수 있을까요?";

/** 2단계 출력을 붙여 진단을 완성한다. 근거 없는 교정은 버린다(원칙 9). */
export function attachCorrections(
  draft: DiagnosisDraft,
  raw: string,
  allowedChunkIds: Set<string>,
): Diagnosis {
  const obj = firstObject(raw) as { corrections?: unknown[] } | null;
  const byQuote = new Map<string, { correction: string; chunkIds: string[] }>();

  for (const c of (obj?.corrections ?? []) as {
    quote?: unknown;
    correction?: unknown;
    chunkIds?: unknown;
  }[]) {
    const chunkIds = (Array.isArray(c.chunkIds) ? c.chunkIds : [])
      .map(str)
      .filter((id) => allowedChunkIds.has(id));
    const correction = str(c.correction);
    if (correction && chunkIds.length > 0) {
      byQuote.set(norm(str(c.quote)), { correction, chunkIds });
    }
  }

  const misconceptions: MisconceptionHit[] = [];
  for (const cand of draft.candidates) {
    const got = byQuote.get(norm(cand.quote));
    if (!got) continue; // 원문에서 근거를 찾지 못한 교정은 내보내지 않는다
    misconceptions.push({
      misconceptionId: cand.misconceptionId,
      quote: cand.quote,
      correction: got.correction,
      chunkIds: got.chunkIds,
    });
  }

  return { elements: draft.elements, misconceptions, followUp: draft.followUp };
}

/** 오개념 후보가 없을 때. 2단계를 부르지 않는다. */
export function withoutCorrections(draft: DiagnosisDraft): Diagnosis {
  return { elements: draft.elements, misconceptions: [], followUp: draft.followUp };
}
