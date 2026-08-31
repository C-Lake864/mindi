import { useState } from "react";
import type { Judgement, Rubric, Turn } from "../lib/types";
import { elementById } from "../lib/rubric";

/* ── 보여 주되, 먼저 들이밀지 않는다 ──────────────────────────────────
   출처와 자동 판정을 한 번 화면에서 뺐다가 되살렸다.
   뺀 이유는 사용자의 말이었다. "빨간불 하나가 전체 신뢰를 깎는다."
   되살린 이유는 이 도구의 약속이다. 문장이 자연스럽다는 것과 근거가
   있다는 것은 다른 사실이고, 그 둘은 구분해서 보여야 한다.

   그래서 접는다. 평소에는 한 줄이고, 궁금할 때 펼친다.
   첫눈에 빨간불이 보이지 않으면 신뢰를 깎지 않으면서 확인할 길은 남는다.
   ─────────────────────────────────────────────────────────────── */

const JUDGE_LABEL: Record<string, string> = {
  grounded: "근거 안에서만 판단했나",
  cited: "내가 쓴 말을 인용했나",
  refusal: "범위 밖을 옳게 거절했나",
  relevant: "내가 말한 것에 답했나",
  complete: "빠뜨린 항목은 없나",
};

const VERDICT_WORD: Record<Judgement["verdict"], string> = {
  pass: "믿을 만해요",
  warn: "한 군데 아쉬워요",
  fail: "이 진단은 의심스러워요",
};

export function TurnCard({
  turn,
  rubric,
  onFeedback,
}: {
  turn: Turn;
  rubric: Rubric;
  onFeedback: (id: string, value: "up" | "down") => void;
}) {
  const [open, setOpen] = useState(false);
  const d = turn.diagnosis;
  const j = turn.judge;

  const required = d ? d.elements.filter((e) => elementById(rubric, e.elementId)?.required) : [];
  const got = required.filter((e) => e.state === "이해");
  const next =
    required.find((e) => e.state === "미도달") ?? required.find((e) => e.state === "부분") ?? null;
  const nextEl = next ? elementById(rubric, next.elementId) : null;

  const sources = turn.retrieval?.hits ?? [];
  const done = !turn.streaming && !turn.error;

  return (
    <article className="card turn">
      <p className="said">{turn.input}</p>

      {turn.error && (
        <div className="trouble">
          <strong>잠깐, 연결이 안 돼요</strong>
          <p>{turn.error}</p>
          <p className="hint">고치고 나서 방금 쓰신 설명을 다시 보내 주세요.</p>
        </div>
      )}

      {d && (
        <div className="report">
          {got.length > 0 && (
            <p className="got">
              {got.length}가지는 잘 설명하셨어요
              <button className="linky" onClick={() => setOpen((v) => !v)}>
                {open ? "접기" : "보기"}
              </button>
            </p>
          )}

          {open && (
            <ul className="element-list">
              {required.map((e) => {
                const el = elementById(rubric, e.elementId);
                return (
                  <li key={e.elementId} className={`st-${e.state}`}>
                    <span className="st">{e.state === "이해" ? "✓" : "·"}</span>
                    <span>
                      {el?.name}
                      {e.evidence && <em> “{e.evidence}”</em>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {d.misconceptions.length > 0 && (
            <div className="fixthis">
              {d.misconceptions.map((m, i) => (
                <p key={i}>
                  “{m.quote}” — {m.correction}{" "}
                  {/* 교정이 어느 문단에서 나왔는지 남긴다. 근거 없는 교정은 애초에 버려진다 */}
                  {m.chunkIds.map((c) => (
                    <span className="cite" key={c}>
                      {c}
                    </span>
                  ))}
                </p>
              ))}
            </div>
          )}

          {nextEl && turn.kind !== "summary" && (
            <p className="next">
              {turn.hintLevel === 1 ? "한 가지가 더 남았어요" : `다음은 ${nextEl.name}`}
            </p>
          )}
        </div>
      )}

      {turn.message && (
        <p className="says">
          {turn.message}
          {turn.streaming && <i className="caret" />}
        </p>
      )}
      {!turn.message && turn.streaming && (
        <p className="says">
          <i className="caret" />
        </p>
      )}

      {done && (
        <div className="aftermath">
          {/* 출처 — 이 답이 무엇을 보고 나왔는지 되짚을 수 있어야 한다 */}
          {sources.length > 0 && (
            <details className="fold small">
              <summary>이 답이 본 자료 {sources.length}개</summary>
              <div className="fold-body">
                <p className="hint" style={{ marginTop: 0 }}>
                  채점 기준은 루브릭입니다. 아래 문단은 범위 판정과 교정의 근거로만 썼어요.
                </p>
                {sources.map((h) => (
                  <div className="evidence" key={h.chunk.id}>
                    <div className="meta">
                      <span className="id">{h.chunk.id}</span>
                      <span>{h.chunk.section}</span>
                      <span>{h.cosine.toFixed(2)}</span>
                      <a href={h.chunk.url} target="_blank" rel="noreferrer noopener">
                        원문에서 보기
                      </a>
                    </div>
                    <p>{h.chunk.text}</p>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* 자동 판정 — 답변이 아니라 이 진단 자체를 따로 검사한 결과 */}
          {j && (
            <details className="fold small">
              <summary>
                이 진단 자체 검사 <span className={`dot-verdict ${j.verdict}`} />{" "}
                <span className="verdict-word">{VERDICT_WORD[j.verdict]}</span>
              </summary>
              <div className="fold-body">
                <p className="hint" style={{ marginTop: 0 }}>
                  글이 매끄러운 것과 근거가 있는 것은 다른 사실이라, 따로 검사해 둡니다.
                </p>
                <ul className="judge-list">
                  {(Object.keys(JUDGE_LABEL) as (keyof typeof JUDGE_LABEL)[]).map((k) => (
                    <li key={k} className={j[k as keyof Judgement] ? "yes" : "no"}>
                      <span>{j[k as keyof Judgement] ? "✓" : "·"}</span>
                      {JUDGE_LABEL[k]}
                    </li>
                  ))}
                </ul>
                {j.reason && <p className="judge-reason">{j.reason}</p>}
              </div>
            </details>
          )}
          {turn.judgeState === "running" && <p className="hint">이 진단을 검사하는 중…</p>}

          {/* 사람 피드백 — 자동 판정과 어긋나는 지점이 다음 실험의 재료가 된다 */}
          <div className="rate">
            <span className="hint">도움이 됐나요?</span>
            <button
              className={turn.feedback === "up" ? "on" : ""}
              aria-pressed={turn.feedback === "up"}
              onClick={() => onFeedback(turn.id, "up")}
            >
              👍
            </button>
            <button
              className={turn.feedback === "down" ? "on" : ""}
              aria-pressed={turn.feedback === "down"}
              onClick={() => onFeedback(turn.id, "down")}
            >
              👎
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
