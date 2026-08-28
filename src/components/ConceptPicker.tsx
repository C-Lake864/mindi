import { domain } from "../config/domain";
import type { Rubric, VectorStore } from "../lib/types";

/** 첫 화면. 이름과 한 줄, 그리고 고를 것. 그 밖에는 아무것도 두지 않는다. */
export function ConceptPicker({
  rubrics,
  store,
  onRead,
  onExplain,
}: {
  rubrics: Rubric[];
  store: VectorStore | null;
  onRead: (id: string) => void;
  onExplain: (id: string) => void;
}) {
  return (
    <div className="lede">
      <h1 className="hero">
        {domain.brand.emoji} {domain.brand.title}
      </h1>
      <p className="hero-sub">{domain.brand.tagline}</p>

      <div className="picks">
        {rubrics.map((r) => (
          <div className="pick" key={r.id}>
            <h3>{r.title}</h3>
            <div className="pick-actions">
              <button className="primary" onClick={() => onExplain(r.id)} disabled={!store}>
                설명해 보기
              </button>
              <button className="ghost" onClick={() => onRead(r.id)} disabled={!store}>
                읽어 보기
              </button>
            </div>
          </div>
        ))}
      </div>

      {!store && <p className="hint">자료를 불러오는 중…</p>}
    </div>
  );
}
