import { useState } from "react";
import { clearLog, readLog, toMarkdown } from "../lib/feedback";

/**
 * 실험 기록 패널.
 *
 * 답 하나가 좋아 보였다는 인상 대신, 어떤 질문에서 어떤 판정이 나왔는지를
 * 남긴다. 여기서 뽑은 표를 README.md 실험 절에 그대로 붙일 수 있다.
 */
export function LogPanel() {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const count = readLog().length;

  return (
    <section className="card">
      <h2>실험 기록</h2>
      <p className="hint">
        이 브라우저에 {count}개의 질문·판정·피드백이 쌓여 있습니다. 표로 뽑아 README의 실험 절에
        붙이세요. 실패한 답도 지우지 말고 남겨야 다음 수정이 무엇을 보존해야 하는지 알 수 있습니다.
      </p>
      <div className="chips">
        <button className="chip" onClick={() => setMarkdown(toMarkdown(readLog()))}>
          표로 뽑기
        </button>
        <button
          className="chip"
          onClick={() => {
            const blob = new Blob([JSON.stringify(readLog(), null, 2)], {
              type: "application/json",
            });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "rag-chatbot-log.json";
            a.click();
            URL.revokeObjectURL(a.href);
          }}
        >
          JSON 내려받기
        </button>
        <button
          className="chip"
          onClick={() => {
            if (confirm("이 브라우저에 저장된 기록을 모두 지웁니다. 계속할까요?")) {
              clearLog();
              setMarkdown(null);
            }
          }}
        >
          비우기
        </button>
      </div>

      {markdown && (
        <div className="overlay" onClick={() => setMarkdown(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <h3>실험 기록 (마크다운)</h3>
              <button onClick={() => navigator.clipboard?.writeText(markdown)}>복사</button>
              <button onClick={() => setMarkdown(null)}>닫기</button>
            </header>
            <pre className="export">{markdown}</pre>
          </div>
        </div>
      )}
    </section>
  );
}
