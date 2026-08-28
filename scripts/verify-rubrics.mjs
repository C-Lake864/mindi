/**
 * 루브릭이 가리키는 원문과 앵커가 실재하는지 확인한다.
 *
 * PRD 6.4 저작 프로세스 1·2단계를 기계로 강제한다.
 * 존재하지 않는 근거에 요소를 매달면 학습자에게 구조적 FP가 생긴다(PRD 6.3).
 *
 *   npm run verify:rubrics
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = resolve(ROOT, "data/rubrics");

async function anchorsOf(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) return { ok: false, status: res.status, ids: new Set() };
  const html = await res.text();
  const ids = new Set();
  for (const m of html.matchAll(/<h[23][^>]*\bid="([^"]+)"/g)) ids.add("#" + m[1]);
  return { ok: true, status: res.status, ids, html };
}

let failures = 0;

for (const file of readdirSync(DIR).filter((f) => f.endsWith(".json"))) {
  const r = JSON.parse(readFileSync(resolve(DIR, file), "utf8"));
  console.log(`\n■ ${r.title} (${file}) v${r.version}`);

  const page = await anchorsOf(r.source.url);
  if (!page.ok) {
    console.log(`  ✗ 원문 ${page.status} — ${r.source.url}`);
    failures++;
    continue;
  }
  console.log(`  ✓ 원문 200 · 앵커 ${page.ids.size}개`);

  const targets = [
    ...r.elements.map((e) => ({ id: e.id, name: e.name, anchor: e.anchor, required: e.required, quote: e.supportingQuote })),
    ...r.misconceptions.map((m) => ({ id: m.id, name: m.statement.slice(0, 24), anchor: m.correctionAnchor, required: false, quote: null })),
  ];

  for (const t of targets) {
    const anchorOk = page.ids.has(t.anchor);
    // 인용 "전체"가 본문에 있어야 한다. 앞부분만 맞춰 보면 뒤를 지어내도 통과한다.
    // 다만 MDN 은 태그 사이에 공백을 끼워 넣으므로("요청( requests )") 양쪽에서
    // 공백을 모두 지운 뒤 비교한다. 한국어에서는 이 정규화가 안전하다.
    let quoteOk = null;
    if (t.quote) {
      const flat = page.html.replace(/<[^>]*>/g, " ").replace(/\s+/g, "");
      quoteOk = flat.includes(t.quote.replace(/\s+/g, ""));
    }

    const marks = [
      anchorOk ? "앵커 ✓" : "앵커 ✗",
      quoteOk === null ? "      " : quoteOk ? "인용 ✓" : "인용 ✗",
    ].join(" ");
    console.log(`    ${marks}  ${t.id} ${t.name}${t.required ? " [필수]" : ""}`);

    if (!anchorOk) failures++;
    // 필수 요소는 지지 원문을 인용할 수 없으면 필수가 될 수 없다(PRD 6.4 원칙 1).
    if (t.required && quoteOk === false) failures++;
  }
}

console.log(
  failures === 0
    ? "\n모든 루브릭이 실재하는 원문과 앵커를 가리킵니다."
    : `\n${failures}건이 실재하지 않는 근거를 가리킵니다. 저작을 고치세요.`,
);
process.exitCode = failures === 0 ? 0 : 1;
