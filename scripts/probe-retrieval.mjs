/**
 * 범위 판정 구간을 실측한다.
 *
 * PRD 7.2 ①은 "루브릭은 범위 밖을 모른다. 검색 유사도만이 그 판정을 한다"고 주장한다.
 * 그 주장이 성립하려면 자료 안 발화와 자료 밖 발화가 유사도로 실제로 갈려야 한다.
 * 갈리지 않으면 구간을 다시 정하거나 7장의 주장을 접어야 한다.
 *
 *   npm run probe
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "@huggingface/transformers";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(readFileSync(resolve(ROOT, "domain.config.json"), "utf8"));
const store = JSON.parse(readFileSync(resolve(ROOT, "public/chunks.json"), "utf8"));

/**
 * 라벨이 붙은 탐침.
 *   in   = 자료 안. 반드시 통과해야 한다
 *   edge = 경계. 확인 질문으로 가거나 거절되어도 사용자를 오도하지 않는다. 통과만 아니면 된다
 *   out  = 자료 밖. 반드시 거절되어야 한다
 */
const PROBES = [
  ["in", "HTTP가 뭔가요"],
  ["in", "브라우저가 서버한테 뭔가 보내면 서버가 답을 준다는 거 같아요"],
  ["in", "요청과 응답이 뭔지 모르겠어요"],
  ["in", "왜 width가 300px인데 350px을 차지하나요"],
  ["in", "패딩이랑 마진 차이가 뭐예요"],
  ["in", "box-sizing border-box 는 뭘 바꾸나요"],
  ["edge", "왜 내 div가 안 움직여요"],
  ["edge", "요소 크기가 생각한 것보다 커요"],
  ["out", "React useEffect 어떻게 쓰나요"],
  ["out", "오늘 서울 날씨 어때"],
  ["out", "파이썬 리스트 컴프리헨션 알려줘"],
  ["out", "자바스크립트 이벤트 루프와 마이크로태스크 큐"],
  ["out", "깃 머지랑 리베이스 차이"],
  ["out", "점심 뭐 먹지"],
];

const extract = await pipeline("feature-extraction", cfg.embedding.modelId, {
  model_file_name: cfg.embedding.modelFileName,
  dtype: "fp32",
});

const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

const rows = [];
for (const [label, text] of PROBES) {
  const out = await extract(cfg.embedding.queryPrefix + text, { pooling: "mean", normalize: true });
  const q = Array.from(out.data);
  let top = -1;
  let chunk = null;
  for (const c of store.chunks) {
    const s = dot(q, c.vector);
    if (s > top) {
      top = s;
      chunk = c;
    }
  }
  rows.push({ label, text, top, chunk });
}

const RULE = "-".repeat(96);
const { accept, ask } = cfg.retrieval.scope;
const band = (v) => (v >= accept ? "안" : v >= ask ? "확인" : "밖");

console.log("\n라벨  유사도  발화 / 가장 가까운 청크");
console.log(RULE);
for (const r of rows) {
  console.log(`${r.label.padEnd(5)} ${r.top.toFixed(3)}  [${band(r.top)}] ${r.text}`);
  console.log(`               ${r.chunk.id} ${r.chunk.section} · ${r.chunk.text.slice(0, 42)}...`);
}

console.log(RULE);
console.log(`구간:  안 >= ${accept}  ·  확인 ${ask} ~ ${accept}  ·  밖 < ${ask}`);

let wrong = 0;
for (const r of rows) {
  const got = band(r.top);
  // 잘못된 것은 두 가지뿐이다. 자료 밖을 안으로 들이거나, 자료 안을 안으로 들이지 못하거나.
  // 경계는 확인 질문으로 가든 거절되든 사용자를 오도하지 않는다.
  const ok =
    r.label === "in" ? got === "안" : r.label === "out" ? got === "밖" : got !== "안";
  if (!ok) {
    wrong++;
    console.log(`  X  ${r.label} "${r.text}" -> ${r.top.toFixed(3)} (${got})`);
  }
}

const at = (l) => rows.filter((r) => r.label === l).map((r) => r.top);
const fmt = (a) => `최저 ${Math.min(...a).toFixed(3)}  최고 ${Math.max(...a).toFixed(3)}`;

console.log(`자료 안   ${fmt(at("in"))}`);
console.log(`경계      ${fmt(at("edge"))}`);
console.log(`자료 밖   ${fmt(at("out"))}`);
console.log(`분리 여유 = ${(Math.min(...at("in")) - Math.max(...at("out"))).toFixed(3)}`);

console.log(
  wrong === 0
    ? `\n${rows.length}건 모두 기대한 구간에 들어갔습니다.`
    : `\n${wrong}건이 기대와 다릅니다. 구간을 다시 정하세요.`,
);
process.exitCode = wrong === 0 ? 0 : 1;
