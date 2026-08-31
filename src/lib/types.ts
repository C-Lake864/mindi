/* ── 지식 원본 (MDN 청크) ─────────────────────────────────────────────
   판정에는 쓰이지 않는다. 범위 판정 · 오개념 교정 근거 · Hint 3 에만 쓴다.
   PRD 7장.
   ──────────────────────────────────────────────────────────────── */

export type Chunk = {
  id: string;
  text: string;
  url: string;
  section: string;
  vector: number[];
};

export type VectorStore = {
  domain: string;
  model: string;
  modelFileName: string;
  dim: number;
  documentPrefixTemplate: string;
  queryPrefix: string;
  builtAt: string;
  chunks: Chunk[];
};

export type Retrieved = {
  chunk: Chunk;
  cosine: number;
  bm25: number;
  cosineRank: number | null;
  bm25Rank: number | null;
  fused: number;
};

export type RetrievalResult = {
  hits: Retrieved[];
  topCosine: number;
  tookMs: number;
};

/* ── 판정 기준 (루브릭) ───────────────────────────────────────────────
   요소별 상태 판정은 오직 이것으로만 한다.
   ──────────────────────────────────────────────────────────────── */

export type RubricElement = {
  id: string;
  name: string;
  required: boolean;
  criterion: string;
  supportingQuote: string;
  anchor: string;
  note?: string;
};

export type Misconception = {
  id: string;
  statement: string;
  conflictsWith: string[];
  correctionAnchor: string;
  origin: string;
};

export type Rubric = {
  id: string;
  title: string;
  group: string;
  version: string;
  source: { title: string; url: string; verifiedAt: string };
  definition: string;
  prompt: {
    kind: "explain" | "explain-code";
    question: string;
    easedQuestion: string;
    /** 코드 예를 접어 둘 때의 안내 문구 */
    exampleLabel?: string;
    snippet?: string;
    expected?: string;
  };
  elements: RubricElement[];
  misconceptions: Misconception[];
};

/* ── 1층 판정: 사용자의 설명을 루브릭으로 채점 ───────────────────────── */

/** PRD 10.2. `부분`과 `확인필요`는 대응이 정반대라 반드시 분리한다. */
export type ElementState = "이해" | "부분" | "확인필요" | "미도달";

export type ElementVerdict = {
  elementId: string;
  state: ElementState;
  /** 이 판정의 근거가 된 사용자 발화 구간. 없으면 빈 문자열 */
  evidence: string;
  /** 왜 그 상태인지 한 문장 */
  reason: string;
};

export type MisconceptionHit = {
  misconceptionId: string | null;
  /** 오개념으로 본 사용자 발화 */
  quote: string;
  /** 교정 문장. 반드시 청크에 근거해야 한다 */
  correction: string;
  chunkIds: string[];
};

export type Diagnosis = {
  elements: ElementVerdict[];
  misconceptions: MisconceptionHit[];
  /** `확인필요` 요소가 있을 때의 되묻기. 단정 대신 확인한다 (원칙 7) */
  followUp: string | null;
};

/* ── 2층 판정: WebCheck 진단의 근거성을 채점 (LLM-as-a-Judge) ───────── */

export type Judgement = {
  grounded: boolean;
  cited: boolean;
  refusal: boolean;
  relevant: boolean;
  complete: boolean;
  verdict: "pass" | "warn" | "fail";
  reason: string;
};

export type Feedback = "up" | "down" | null;

/* ── 대화 상태 ─────────────────────────────────────────────────────── */

export type ScopeBand = "안" | "확인" | "밖";

export type ScopeCheck = {
  band: ScopeBand;
  topCosine: number;
  /** 가장 가까웠던 청크. 거절할 때도 근거로 화면에 남긴다 */
  nearest: Chunk | null;
  /** 정답을 바로 달라는 요청인가. 유사도와 무관하게 거절한다 (원칙 2) */
  answerDemand: boolean;
};

export type TurnKind = "diagnosis" | "refusal" | "confirm" | "ease" | "hint" | "summary";

export type Turn = {
  id: string;
  kind: TurnKind;
  /** 사용자가 이 턴에 입력한 설명 */
  input: string;
  /** 몇 번째 설명 시도인가. 0은 첫 설명 */
  attempt: number;

  scope: ScopeCheck | null;
  retrieval: RetrievalResult | null;
  diagnosis: Diagnosis | null;
  /** 거절·확인·힌트·요약에서 사용자에게 보일 본문 */
  message: string;

  /** 이 턴에 제공한 힌트 단계. 1단계에서는 요소 이름을 화면에도 쓰지 않는다 */
  hintLevel: number;
  judge: Judgement | null;
  judgeState: "idle" | "running" | "done" | "error";
  /** 사람 피드백. 자동 판정과 나란히 기록에 남는다 */
  feedback: Feedback;

  error: string | null;
  streaming: boolean;
  engine: string;
  model: string;
  createdAt: string;
};

export type Ending = "achieved" | "exhausted" | null;

export type Session = {
  rubricId: string;
  /** 완화 질문은 1회만. 두 번 하면 되묻기만 하는 도구가 된다 (PRD F2) */
  easedOnce: boolean;
  /** 되묻기 횟수. 재설명 횟수를 쓰지 않으므로 따로 세지 않으면 끝나지 않는다 */
  confirms: number;
  turns: Turn[];
  /** 0 = 아직 힌트 없음. 1~3 = 제공된 힌트 단계 */
  hintLevel: number;
  /** 재설명 횟수 */
  attempts: number;
  ending: Ending;
  /** 마지막 진단. 결과 화면과 재설명 비교에 쓴다 */
  latest: Diagnosis | null;
};

