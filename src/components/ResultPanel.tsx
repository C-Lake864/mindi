import { requiredElements } from "../lib/rubric";
import type { Diagnosis, Ending, Rubric } from "../lib/types";

/**
 * 옆에 두는 진행 표시.
 *
 * 처음에는 요소마다 ✗ 상자와 RB-A1 같은 코드를 늘어놓았다. 사용자가
 * "이해를 못하겠다"고 했고 맞는 말이다. RB-A1 은 내부 식별자이고,
 * ✗ 여섯 개는 진행이 아니라 실패처럼 보인다.
 *
 * 지금은 점 여섯 개와 숫자 하나만 둔다. 이름은 채운 것만 보여 준다.
 * 아직 못 채운 것의 이름을 여기에 쓰면 힌트 단계를 건너뛰는 셈이 된다.
 */
export function ResultPanel({
  rubric,
  diagnosis,
  ending,
}: {
  rubric: Rubric;
  diagnosis: Diagnosis | null;
  ending: Ending;
}) {
  const required = requiredElements(rubric);
  const done = required.filter(
    (e) => diagnosis?.elements.find((v) => v.elementId === e.id)?.state === "이해",
  );

  return (
    <section className="card progress-card">
      <div className="dots">
        {required.map((e) => (
          <span
            key={e.id}
            className={done.some((d) => d.id === e.id) ? "dot-on" : "dot-off"}
            title={done.some((d) => d.id === e.id) ? e.name : "아직"}
          />
        ))}
        <b>
          {done.length}/{required.length}
        </b>
      </div>

      <p className="progress-line">
        {ending === "achieved"
          ? "다 설명하셨어요"
          : ending === "exhausted"
            ? "여기까지 하고 마무리했어요"
            : done.length === 0
              ? "설명을 기다리고 있어요"
              : `${done.map((e) => e.name).join(", ")} 설명함`}
      </p>

    </section>
  );
}
