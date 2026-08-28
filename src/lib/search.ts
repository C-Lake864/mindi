import { domain } from "../config/domain";
import type { Chunk, Retrieved, RetrievalResult, VectorStore } from "./types";

/* ── 토큰화 ──────────────────────────────────────────────────────────────
   한국어는 조사가 붙어 어절 단위 일치가 잘 깨진다. "모두콘은"과 "모두콘"이
   다른 토큰이 되어 버린다. 그래서 한글 어절은 어절 자체와 함께 글자 2-gram도
   토큰으로 넣는다. 영문·숫자는 그대로 소문자 어절로 쓴다.
   ──────────────────────────────────────────────────────────────────── */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const words = text.toLowerCase().match(/[a-z0-9._-]+|[가-힣]+/g) ?? [];
  for (const w of words) {
    tokens.push(w);
    if (/[가-힣]/.test(w) && w.length > 1) {
      for (let i = 0; i < w.length - 1; i++) tokens.push(w.slice(i, i + 2));
    }
  }
  return tokens;
}

/* ── BM25 ─────────────────────────────────────────────────────────────── */
const K1 = 1.5;
const B = 0.75;

export type Bm25Index = {
  docs: string[][];
  df: Map<string, number>;
  avgLen: number;
  n: number;
};

export function buildBm25(chunks: Chunk[]): Bm25Index {
  const docs = chunks.map((c) => tokenize(`${c.section} ${c.text}`));
  const df = new Map<string, number>();
  for (const doc of docs) {
    for (const t of new Set(doc)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const avgLen = docs.reduce((s, d) => s + d.length, 0) / (docs.length || 1);
  return { docs, df, avgLen, n: docs.length };
}

export function bm25Scores(index: Bm25Index, query: string): number[] {
  const qTokens = [...new Set(tokenize(query))];
  return index.docs.map((doc) => {
    const tf = new Map<string, number>();
    for (const t of doc) tf.set(t, (tf.get(t) ?? 0) + 1);

    let score = 0;
    for (const q of qTokens) {
      const f = tf.get(q);
      if (!f) continue;
      const df = index.df.get(q) ?? 0;
      const idf = Math.log(1 + (index.n - df + 0.5) / (df + 0.5));
      score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * doc.length) / index.avgLen)));
    }
    return score;
  });
}

/* ── 코사인 ────────────────────────────────────────────────────────────
   저장된 벡터도 질문 벡터도 정규화되어 있으므로 내적이 곧 코사인이다.
   ──────────────────────────────────────────────────────────────────── */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

function ranksOf(scores: number[]): (number | null)[] {
  const order = scores
    .map((s, i) => ({ s, i }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  const ranks: (number | null)[] = scores.map(() => null);
  order.forEach((x, r) => (ranks[x.i] = r + 1));
  return ranks;
}

/**
 * 코사인과 BM25를 Reciprocal Rank Fusion으로 합친다.
 *
 * 두 검색기의 점수는 척도가 달라 직접 더할 수 없다. RRF는 점수 대신 순위만
 * 쓰므로 정규화 없이 합칠 수 있고, 한쪽에서만 상위에 오른 근거도 살아남는다.
 */
export function hybridSearch(
  store: VectorStore,
  bm25: Bm25Index,
  queryVector: number[],
  query: string,
  opts?: { topK?: number; rrfK?: number },
): RetrievalResult {
  const t0 = performance.now();
  const topK = opts?.topK ?? domain.retrieval.topK;
  const rrfK = opts?.rrfK ?? domain.retrieval.rrfK;

  const cosScores = store.chunks.map((c) => cosine(queryVector, c.vector));
  const lexScores = bm25Scores(bm25, query);
  const cosRanks = ranksOf(cosScores);
  const lexRanks = ranksOf(lexScores);

  const hits: Retrieved[] = store.chunks.map((chunk, i) => {
    const cr = cosRanks[i];
    const lr = lexRanks[i];
    const fused = (cr ? 1 / (rrfK + cr) : 0) + (lr ? 1 / (rrfK + lr) : 0);
    return {
      chunk,
      cosine: cosScores[i],
      bm25: lexScores[i],
      cosineRank: cr,
      bm25Rank: lr,
      fused,
    };
  });

  hits.sort((a, b) => b.fused - a.fused || b.cosine - a.cosine);
  const top = hits.slice(0, topK);
  const topCosine = Math.max(...cosScores);

  // 결과를 버리지 않는다. 버리면 사용자는 왜 답이 없는지 모른다.
  // 범위 판정은 여기서 하지 않고 scope.ts 가 topCosine 을 보고 결정한다.
  return { hits: top, topCosine, tookMs: performance.now() - t0 };
}
