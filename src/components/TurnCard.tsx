import { useState } from "react";
import type { Rubric, Turn } from "../lib/types";
import { elementById } from "../lib/rubric";

/* ── 화면에 무엇을 두지 않았는가 ───────────────────────────────────────
   자동 판정(grounded/cited/…) 배지를 여기서 뺐다. 여섯 칸 중 하나만
   빨간불이어도 사용자는 진단 전체를 못 믿게 된다. 그 판정은 원래
   학습자가 보라고 만든 것이 아니라 이 도구가 제대로 판정하는지
   재려고 만든 것이라, 기록에만 남기고 화면에서는 뺀다.
   (설정과 기록 → 표로 뽑기, 그리고 npm run measure)
   ─────────────────────────────────────────────────────────────── */

export function TurnCard({ turn, rubric }: { turn: Turn; rubric: Rubric }) {
  const [open, setOpen] = useState(false);
  const d = turn.diagnosis;

  const required = d ? d.elements.filter((e) => elementById(rubric, e.elementId)?.required) : [];
  const got = required.filter((e) => e.state === "이해");
  const next =
    required.find((e) => e.state === "미도달") ?? required.find((e) => e.state === "부분") ?? null;
  const nextEl = next ? elementById(rubric, next.elementId) : null;

  return (
    <article className="card turn">
      <p className="said">{turn.input}</p>

      {turn.error && <div className="error-banner">{turn.error}</div>}

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
                  “{m.quote}” — {m.correction}
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

      {turn.message && <p className="says">{turn.message}</p>}
    </article>
  );
}
