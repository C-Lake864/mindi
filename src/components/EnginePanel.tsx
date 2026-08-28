import { useState } from "react";
import { domain } from "../config/domain";
import type { LoadProgress } from "../lib/embedder";
import type { OllamaStatus } from "../lib/ollama";
import { getGeminiKey, setGeminiKey } from "../lib/gemini";

export type Engine = "ollama" | "gemini";

export function EnginePanel({
  engine,
  setEngine,
  model,
  setModel,
  ollama,
  onRecheck,
  embedding,
}: {
  engine: Engine;
  setEngine: (e: Engine) => void;
  model: string;
  setModel: (m: string) => void;
  ollama: OllamaStatus;
  onRecheck: () => void;
  embedding: LoadProgress;
}) {
  const [key, setKey] = useState(getGeminiKey());

  // 설정에 적힌 후보와 실제로 설치된 모델을 합쳐 보여 준다.
  const installed = ollama.state === "up" ? ollama.models : [];
  const options = [...new Set([...installed, ...domain.ollama.suggestedModels])];

  const dot =
    embedding.status === "ready" ? "up" : embedding.status === "error" ? "down" : "wait";

  return (
    <section className="card">
      <h2>챗봇 상태</h2>

      <div className="status-row">
        <i className={`dot ${dot}`} />
        <span>임베딩 모델</span>
        <span className="detail">
          {embedding.status === "ready"
            ? "준비 완료"
            : embedding.status === "downloading"
              ? `${Math.round(embedding.progress * 100)}%`
              : embedding.status === "error"
                ? "실패"
                : "첫 질문에 시작"}
        </span>
      </div>
      {embedding.status === "downloading" && (
        <>
          <div className="progress">
            <i style={{ width: `${Math.round(embedding.progress * 100)}%` }} />
          </div>
          <p className="hint">{embedding.message}</p>
        </>
      )}
      {embedding.status === "idle" && (
        <p className="hint">첫 방문에는 약 200MB를 내려받습니다. 이후에는 브라우저 캐시에서 불러옵니다.</p>
      )}

      <div className="status-row">
        <i
          className={`dot ${
            ollama.state === "up" ? "up" : ollama.state === "checking" ? "wait" : "down"
          }`}
        />
        <span>Ollama</span>
        <span className="detail">
          {ollama.state === "up"
            ? `모델 ${ollama.models.length}개`
            : ollama.state === "checking"
              ? "확인 중"
              : "연결 안 됨"}
        </span>
      </div>

      {ollama.state === "down" && engine === "ollama" && (
        <div className="error-banner" style={{ marginTop: 8 }}>
          <p style={{ margin: "0 0 8px" }}>{ollama.reason}</p>
          <p style={{ margin: "0 0 6px" }}>
            1. Ollama를 실행하고 <code>ollama pull {model}</code> 로 모델을 준비하세요.
          </p>
          <p style={{ margin: "0 0 8px" }}>
            2. 이 페이지 출처를 허용하세요. 윈도우에서는{" "}
            <code>setx OLLAMA_ORIGINS &quot;*&quot;</code> 실행 후 Ollama를 완전히 종료했다 다시
            켜야 합니다.
          </p>
          <button className="chip" onClick={onRecheck}>
            다시 확인
          </button>
        </div>
      )}

      <label className="field" htmlFor="engine">
        답변 엔진
      </label>
      <select id="engine" value={engine} onChange={(e) => setEngine(e.target.value as Engine)}>
        <option value="ollama">로컬 Ollama (기본 · 무료)</option>
        <option value="gemini">Gemini API (선택 · 키 필요)</option>
      </select>

      {engine === "ollama" ? (
        <>
          <label className="field" htmlFor="model">
            모델
          </label>
          <select id="model" value={model} onChange={(e) => setModel(e.target.value)}>
            {options.map((m) => (
              <option key={m} value={m}>
                {m}
                {installed.includes(m) ? "" : " (미설치)"}
              </option>
            ))}
          </select>
        </>
      ) : (
        <>
          <label className="field" htmlFor="gkey">
            Gemini API 키
          </label>
          <input
            id="gkey"
            type="password"
            value={key}
            placeholder="AIza..."
            onChange={(e) => {
              setKey(e.target.value);
              setGeminiKey(e.target.value.trim());
            }}
          />
          <p className="hint">
            키는 이 브라우저에만 저장되고 서버로 보내지 않습니다. 요청은 브라우저에서 Google로 직접
            나갑니다. 같은 질문을 두 엔진에 넣어 판정 결과가 어떻게 갈리는지 비교해 보세요.
          </p>
        </>
      )}
    </section>
  );
}
