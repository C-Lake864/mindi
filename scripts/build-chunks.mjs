/**
 * data/source.md -> public/chunks.json
 *
 * 사실 단위 한 줄을 청크 하나로 만들고, 문서 벡터를 미리 계산해 정적 파일로 굽는다.
 * 브라우저는 질문 벡터 하나만 계산하면 되므로 첫 응답이 빨라진다.
 *
 *   npm run embed
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "@huggingface/transformers";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(readFileSync(resolve(ROOT, "domain.config.json"), "utf8"));

const URL_DIRECTIVE = /^<!--\s*url:\s*(\S+)\s*-->$/;

/** `## 섹션` / url 지시자 / `- 사실` 세 가지만 읽는다. 나머지 주석은 건너뛴다. */
function parseSource(md) {
  const chunks = [];
  let section = "일반";
  let url = "";
  let inComment = false;
  let n = 0;

  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();

    // 파일 상단의 사용 설명처럼 여러 줄에 걸친 주석은 통째로 건너뛴다.
    // 정규식으로 한 번에 걷어내면 주석 안에 예시로 적어 둔 지시자에 걸린다.
    if (inComment) {
      if (line.includes("-->")) inComment = false;
      continue;
    }
    if (line.startsWith("<!--") && !URL_DIRECTIVE.test(line)) {
      if (!line.includes("-->")) inComment = true;
      continue;
    }

    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      section = heading[1].trim();
      continue;
    }

    const urlComment = line.match(URL_DIRECTIVE);
    if (urlComment) {
      url = urlComment[1];
      continue;
    }

    const bullet = line.match(/^-\s+(.+)$/);
    if (bullet) {
      const text = bullet[1].trim();
      if (!url) {
        throw new Error(
          `출처 URL 없이 청크가 나왔습니다. 섹션 "${section}" 아래에 url 지시자를 넣으세요.\n  → ${text}`,
        );
      }
      n += 1;
      chunks.push({
        id: `${cfg.chunkIdPrefix}-${String(n).padStart(3, "0")}`,
        text,
        url,
        section,
      });
    }
  }
  return chunks;
}

const md = readFileSync(resolve(ROOT, "data/source.md"), "utf8");
const chunks = parseSource(md);
if (chunks.length === 0) throw new Error("data/source.md 에서 청크를 하나도 찾지 못했습니다.");

console.log(`청크 ${chunks.length}개 파싱 완료. 임베딩 모델을 준비합니다...`);

const { modelId, modelFileName, dim, documentPrefixTemplate } = cfg.embedding;

// 브라우저와 같은 no_gather_q4 그래프를 쓴다. 문서 벡터와 질문 벡터가
// 서로 다른 양자화 경로에서 나오면 점수를 비교할 자리가 흔들린다.
const extract = await pipeline("feature-extraction", modelId, {
  model_file_name: modelFileName,
  dtype: "fp32", // model_file_name 이 파일명을 확정하므로 접미사는 비워 둔다
});

const t0 = Date.now();
for (const c of chunks) {
  const prefix = documentPrefixTemplate.replace("{section}", c.section || "none");
  const out = await extract(prefix + c.text, { pooling: "mean", normalize: true });
  const vec = Array.from(out.data, (v) => Math.round(v * 1e6) / 1e6);
  if (vec.length !== dim) {
    throw new Error(`벡터 차원이 ${vec.length} 입니다. domain.config.json 의 embedding.dim(${dim})과 다릅니다.`);
  }
  c.vector = vec;
  console.log(`  ${c.id}  ${c.section} · ${c.text.slice(0, 30)}…`);
}

const store = {
  domain: cfg.id,
  model: modelId,
  modelFileName,
  dim,
  documentPrefixTemplate,
  queryPrefix: cfg.embedding.queryPrefix,
  builtAt: new Date().toISOString(),
  chunks,
};

mkdirSync(resolve(ROOT, "public"), { recursive: true });
const json = JSON.stringify(store);
writeFileSync(resolve(ROOT, "public/chunks.json"), json);
console.log(
  `\n완료: public/chunks.json · 청크 ${chunks.length}개 · ${dim}차원 · ` +
    `${(Buffer.byteLength(json) / 1024).toFixed(0)}KB · ${((Date.now() - t0) / 1000).toFixed(1)}초`,
);
