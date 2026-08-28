/**
 * PRD 16장 고정 답변 세트 측정.
 *
 * 앱이 실제로 쓰는 모듈을 그대로 불러 쓴다. 프롬프트나 파서를 여기서 다시
 * 구현하면 측정 대상이 앱이 아니라 이 파일이 되어 버린다. 그래서 esbuild 로
 * 앱 코드를 묶어 돌린다(npm run measure).
 *
 * 브라우저 전용인 것은 둘뿐이라 여기서만 갈아 끼운다.
 *   - 질의 임베딩: 브라우저는 WASM, 여기서는 Node. 같은 모델·같은 그래프를 쓴다.
 *   - Ollama 호출: ollamaChat 을 그대로 쓴다.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "@huggingface/transformers";

import { domain } from "../src/config/domain";
import { buildBm25, hybridSearch } from "../src/lib/search";
import { checkScope } from "../src/lib/scope";
import { getRubric, isAchieved, requiredElements } from "../src/lib/rubric";
import {
  attachCorrections,
  buildCorrectionSystem,
  buildCorrectionUser,
  buildDiagnosisSystem,
  buildDiagnosisUser,
  parseDiagnosis,
  withoutCorrections,
} from "../src/lib/diagnose";
import { JUDGE_SYSTEM, buildJudgeUser, parseJudgement } from "../src/lib/judge";
import { ollamaChat } from "../src/lib/ollama";
import type { Diagnosis, Judgement, Turn, VectorStore } from "../src/lib/types";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MODEL = process.env.MEASURE_MODEL ?? domain.ollama.defaultModel;

type Item = {
  id: string;
  rubricId: string;
  label: "correct" | "paraphrase" | "partial" | "misconception" | "outofscope";
  text: string;
  note?: string;
  expectMissing?: string[];
  expectMisconception?: string;
};

const set = JSON.parse(readFileSync(resolve(ROOT, "data/fixed-set.json"), "utf8")) as {
  version: string;
  items: Item[];
  consistency: { repeats: number; itemIds: string[] };
};
const store = JSON.parse(
  readFileSync(resolve(ROOT, "public/chunks.json"), "utf8"),
) as VectorStore;
const bm25 = buildBm25(store.chunks);
const chunkIds = new Set(store.chunks.map((c) => c.id));

const extract = await pipeline("feature-extraction", domain.embedding.modelId, {
  model_file_name: domain.embedding.modelFileName,
  dtype: "fp32",
});

async function embed(text: string): Promise<number[]> {
  const out = await extract(domain.embedding.queryPrefix + text, {
    pooling: "mean",
    normalize: true,
  });
  return Array.from(out.data as Float32Array);
}

const run = (system: string, user: string, json: boolean) =>
  ollamaChat({ model: MODEL, system, user, json, onText: () => {}, temperature: 0 });

type Result = {
  item: Item;
  band: string;
  topCosine: number;
  answerDemand: boolean;
  refused: boolean;
  diagnosis: Diagnosis | null;
  judge: Judgement | null;
  achieved: boolean;
  /** 인용이 학습자 발화에 없어 보류된 요소 수. 진단기가 근거를 지어낸 횟수다. */
  downgraded: number;
  ms: number;
};

/** 앱의 submit 과 같은 순서를 따른다. */
async function measureOne(item: Item, withJudge = true): Promise<Result> {
  const t0 = Date.now();
  const rubric = getRubric(item.rubricId)!;
  const vector = await embed(item.text);
  const retrieval = hybridSearch(store, bm25, vector, item.text);
  const scope = checkScope(item.text, retrieval);

  const base: Result = {
    item,
    band: scope.band,
    topCosine: scope.topCosine,
    answerDemand: scope.answerDemand,
    refused: false,
    diagnosis: null,
    judge: null,
    achieved: false,
    downgraded: 0,
    ms: 0,
  };

  if (scope.answerDemand || scope.band === "밖") {
    base.refused = true;
    base.ms = Date.now() - t0;
    return base;
  }

  const draft = parseDiagnosis(
    await run(buildDiagnosisSystem(rubric), buildDiagnosisUser(item.text, null), true),
    rubric,
    item.text,
  );

  const diagnosis =
    draft.candidates.length > 0
      ? attachCorrections(
          draft,
          await run(
            buildCorrectionSystem(rubric),
            buildCorrectionUser(draft.candidates, retrieval),
            true,
          ),
          chunkIds,
        )
      : withoutCorrections(draft);

  base.diagnosis = diagnosis;
  base.achieved = isAchieved(rubric, diagnosis);
  base.downgraded = diagnosis.elements.filter((e) =>
    e.reason.startsWith("진단기가 든 근거가"),
  ).length;

  if (withJudge) {
    const turn: Turn = {
      id: item.id,
      kind: "diagnosis",
      input: item.text,
      attempt: 0,
      scope,
      retrieval,
      diagnosis,
      message: "",
      hintLevel: 0,
      judge: null,
      judgeState: "idle",
      error: null,
      streaming: false,
      engine: "ollama",
      model: MODEL,
      createdAt: new Date().toISOString(),
    };
    base.judge = parseJudgement(await run(JUDGE_SYSTEM, buildJudgeUser(turn, rubric), true));
  }

  base.ms = Date.now() - t0;
  return base;
}

/* ── 실행 ──────────────────────────────────────────────────────────── */

console.log(`고정 세트 v${set.version} · ${set.items.length}건 · 모델 ${MODEL}\n`);

// MEASURE_ONLY=H-1,B-1 로 일부만 돌려 볼 수 있다. 긴 측정 전 연기 시험용.
const only = process.env.MEASURE_ONLY?.split(",").map((s) => s.trim());
const items = only ? set.items.filter((i) => only.includes(i.id)) : set.items;

const results: Result[] = [];
for (const item of items) {
  const r = await measureOne(item);
  results.push(r);
  const states = r.diagnosis
    ? r.diagnosis.elements
        .filter((e) => getRubric(item.rubricId)!.elements.find((x) => x.id === e.elementId)?.required)
        .map((e) => e.state[0])
        .join("")
    : "거절";
  console.log(
    `${item.id.padEnd(4)} ${item.label.padEnd(13)} ${r.topCosine.toFixed(3)} ${r.band.padEnd(2)} ` +
      `${states.padEnd(8)} 오개념${r.diagnosis?.misconceptions.length ?? 0} 보류${r.downgraded} ` +
      `${r.achieved ? "달성" : "미달"} ${r.judge?.verdict ?? "-"} ${(r.ms / 1000).toFixed(0)}s`,
  );
}

/* ── 지표 (PRD 15.1) ───────────────────────────────────────────────── */

const RULE = "-".repeat(88);
const by = (l: string) => results.filter((r) => r.item.label === l);
const requiredStates = (r: Result) => {
  const rubric = getRubric(r.item.rubricId)!;
  return requiredElements(rubric).map(
    (e) => r.diagnosis?.elements.find((v) => v.elementId === e.id)?.state ?? "미도달",
  );
};

// FP: 정확한 설명을 `미도달` 또는 `오개념`으로 판정한 것.
const fpItems = by("paraphrase").filter(
  (r) =>
    r.refused ||
    requiredStates(r).includes("미도달") ||
    (r.diagnosis?.misconceptions.length ?? 0) > 0,
);

// 표현 변형 정답인데 달성에 이르지 못한 것. FP 는 아니지만 신호 손실이다.
const notCredited = by("paraphrase").filter((r) => !r.achieved && !fpItems.includes(r));

// 탐지 누락: 결함이 있는데 달성으로 통과시킨 것.
const missedDefects = [...by("partial"), ...by("misconception")].filter((r) => r.achieved);

// 부분 누락에서 비어야 할 요소를 `이해`로 준 것.
const overCredited = by("partial").flatMap((r) =>
  (r.item.expectMissing ?? []).filter(
    (id) => r.diagnosis?.elements.find((e) => e.elementId === id)?.state === "이해",
  ).map((id) => `${r.item.id}/${id}`),
);

const misconceptionCaught = by("misconception").filter(
  (r) => (r.diagnosis?.misconceptions.length ?? 0) > 0,
);
const scopeOk = by("outofscope").filter((r) => r.refused);
const correctAchieved = by("correct").filter((r) => r.achieved);

console.log(`\n${RULE}\n지표 (PRD 15.1)\n${RULE}`);
const line = (name: string, got: string, target: string, ok: boolean) =>
  console.log(`${ok ? "PASS" : "FAIL"}  ${name.padEnd(30)} ${got.padEnd(16)} 목표 ${target}`);

line("오판정 FP (표현 변형 정답)", `${fpItems.length}건 / 6`, "0건 (상한 제약)", fpItems.length === 0);
line("  └ 달성 못 함 (신호 손실)", `${notCredited.length}건 / 6`, "참고 지표", true);
line("탐지 누락 (결함을 통과시킴)", `${missedDefects.length}건 / 8`, "2건 이하", missedDefects.length <= 2);
line("  └ 누락 요소를 이해로 줌", `${overCredited.length}칸`, "참고 지표", true);
line("오개념 탐지", `${misconceptionCaught.length}건 / 4`, "3건 이상", misconceptionCaught.length >= 3);
line("범위 밖 거절", `${scopeOk.length}건 / 2`, "2건", scopeOk.length === 2);
line("완전한 정답 달성", `${correctAchieved.length}건 / 2`, "2건", correctAchieved.length === 2);

if (fpItems.length) console.log(`\n  FP 발생: ${fpItems.map((r) => r.item.id).join(", ")}`);
if (notCredited.length) console.log(`  미달성: ${notCredited.map((r) => r.item.id).join(", ")}`);
if (missedDefects.length) console.log(`  통과시킨 결함: ${missedDefects.map((r) => r.item.id).join(", ")}`);
if (overCredited.length) console.log(`  과잉 인정: ${overCredited.join(", ")}`);

/* ── 판정 일관성 ───────────────────────────────────────────────────── */

console.log(`\n${RULE}\n판정 일관성 (같은 입력 ${set.consistency.repeats}회)\n${RULE}`);

let cells = 0;
let unstable = 0;
const consistencyRows: { id: string; unstable: number; cells: number; detail: string[] }[] = [];

for (const id of set.consistency.itemIds) {
  const item = set.items.find((i) => i.id === id)!;
  const rubric = getRubric(item.rubricId)!;
  const runs: string[][] = [];
  for (let i = 0; i < set.consistency.repeats; i++) {
    runs.push(requiredStates(await measureOne(item, false)));
  }
  const detail: string[] = [];
  let itemUnstable = 0;
  requiredElements(rubric).forEach((el, i) => {
    const seen = new Set(runs.map((r) => r[i]));
    cells++;
    if (seen.size > 1) {
      unstable++;
      itemUnstable++;
      detail.push(`${el.id}(${[...seen].join("/")})`);
    }
  });
  consistencyRows.push({ id, unstable: itemUnstable, cells: requiredElements(rubric).length, detail });
  console.log(
    `${id.padEnd(4)} 불일치 ${itemUnstable}/${requiredElements(rubric).length}  ${detail.join(" ") || "전부 일치"}`,
  );
}

console.log(`\n합계 불일치 ${unstable}/${cells}칸`);

writeFileSync(
  resolve(ROOT, "measurement.json"),
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      setVersion: set.version,
      model: MODEL,
      chunkCount: store.chunks.length,
      scope: domain.retrieval.scope,
      metrics: {
        fp: fpItems.map((r) => r.item.id),
        notCredited: notCredited.map((r) => r.item.id),
        missedDefects: missedDefects.map((r) => r.item.id),
        overCredited,
        misconceptionCaught: misconceptionCaught.map((r) => r.item.id),
        scopeRefused: scopeOk.map((r) => r.item.id),
        correctAchieved: correctAchieved.map((r) => r.item.id),
        consistency: { unstable, cells, rows: consistencyRows },
      },
      results: results.map((r) => ({
        id: r.item.id,
        label: r.item.label,
        topCosine: r.topCosine,
        band: r.band,
        refused: r.refused,
        achieved: r.achieved,
        downgraded: r.downgraded,
        states: r.diagnosis?.elements.map((e) => `${e.elementId}:${e.state}`),
        misconceptions: r.diagnosis?.misconceptions.map((m) => m.quote),
        judge: r.judge,
      })),
    },
    null,
    2,
  ),
);
console.log("\n결과를 measurement.json 에 남겼습니다.");
