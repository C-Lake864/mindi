import { useState } from "react";
import { sourceSummary } from "../lib/messages";
import type { Rubric, VectorStore } from "../lib/types";

/** "HTTP · 클라이언트" 에서 뒤쪽만. 이 낱말이 그 문단의 키워드다. */
const keywordOf = (section: string) => section.replace(/^.*·\s*/, "");

/**
 * 읽기 화면.
 *
 * 채점으로 가는 관문이 아니라 그 자체로 끝날 수 있는 경로다.
 *
 * 문단마다 키워드를 왼쪽에 세워 둔다. "가리기"를 누르면 본문만 흐려지고
 * 키워드는 남는다. 남은 낱말을 보고 내용을 떠올려 보는 것이 이 화면의 쓸모다.
 * 처음에는 여기에 "담기" 버튼을 두었는데, 무엇을 담는지도 왜 담는지도
 * 화면에서 알 수 없어 걷어냈다.
 */
export function SourceIntro({
  rubric,
  store,
  onExplain,
  onDone,
}: {
  rubric: Rubric;
  store: VectorStore | null;
  onExplain: () => void;
  onDone: () => void;
}) {
  const [hidden, setHidden] = useState(false);
  const { chunks } = sourceSummary(rubric, store, 8);

  return (
    <article className="card reader">
      <div className="reader-head">
        <h2 className="lede-h">{rubric.title}</h2>
        <button className="ghost small" onClick={() => setHidden((v) => !v)}>
          {hidden ? "보이기" : "가리기"}
        </button>
      </div>

      <p className="hint hidden-note">
        {hidden
          ? "키워드만 남겨 두었어요. 무슨 내용이었는지 떠올려 보세요."
          : "왼쪽 낱말이 그 문단의 키워드입니다. 가리기를 누르면 키워드만 남습니다."}
      </p>

      {chunks.length === 0 && <p className="hint">이 개념의 원문을 찾지 못했습니다.</p>}

      {chunks.map((c) => (
        <div className="read-row" key={c.id}>
          <span className="kw">{keywordOf(c.section)}</span>
          <p className={hidden ? "veiled" : undefined}>{c.text}</p>
        </div>
      ))}

      <p className="hint source-note">
        MDN{" "}
        <a href={rubric.source.url} target="_blank" rel="noreferrer noopener">
          {rubric.source.title}
        </a>{" "}
        · CC-BY-SA 2.5
      </p>

      <div className="pick-actions">
        <button className="primary" onClick={onExplain}>
          설명해 볼게요
        </button>
        <button className="ghost" onClick={onDone}>
          이걸로 충분해요
        </button>
      </div>
    </article>
  );
}
