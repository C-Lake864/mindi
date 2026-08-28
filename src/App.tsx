import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { domain } from "./config/domain";
import { embedQuery, type LoadProgress } from "./lib/embedder";
import { buildBm25, hybridSearch } from "./lib/search";
import { checkOllama, ollamaChat, type OllamaStatus } from "./lib/ollama";
import { geminiChat } from "./lib/gemini";
import { getRubric, RUBRICS, unmetRequired } from "./lib/rubric";
import { checkScope } from "./lib/scope";
import {
  attachCorrections,
  buildCorrectionSystem,
  buildCorrectionUser,
  buildDiagnosisSystem,
  buildDiagnosisUser,
  parseDiagnosis,
  withoutCorrections,
} from "./lib/diagnose";
import {
  buildHintSystem,
  buildHintUser,
  buildSummarySystem,
  buildSummaryUser,
  parseText,
} from "./lib/hint";
import { buildJudgeUser, JUDGE_SYSTEM, parseJudgement } from "./lib/judge";
import { confirmMessage, refusalMessage } from "./lib/messages";
import { decideNext, newSession, MAX_RETRIES } from "./lib/session";
import { upsertLog } from "./lib/feedback";
import type { Session, Turn, TurnKind, VectorStore } from "./lib/types";
import { ConceptPicker } from "./components/ConceptPicker";
import { SourceIntro } from "./components/SourceIntro";
import { EnginePanel, type Engine } from "./components/EnginePanel";
import { LogPanel } from "./components/LogPanel";
import { TurnCard } from "./components/TurnCard";
import { ResultPanel } from "./components/ResultPanel";

const IDLE: LoadProgress = { status: "idle", progress: 0, message: "" };

type Stage = "pick" | "read" | "work";

/**
 * 설명이라고 보기 어려울 만큼 짧은가.
 *
 * "요청하고 응답하는 거요" 같은 첫 입력을 곧바로 여덟 개 요소로 채점하면,
 * 처음 온 사람은 화면 가득한 ✗ 를 보고 그만둔다. 이런 입력은 채점 대상이
 * 아니라 완화 질문 대상이다 (PRD F2).
 */
function tooShortToGrade(text: string): boolean {
  const bare = text.replace(/\s+/g, "");
  return bare.length < 25;
}

export default function App() {
  const [store, setStore] = useState<VectorStore | null>(null);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [embedding, setEmbedding] = useState<LoadProgress>(IDLE);
  const [ollama, setOllama] = useState<OllamaStatus>({ state: "checking" });
  const [engine, setEngine] = useState<Engine>("ollama");
  const [model, setModel] = useState(domain.ollama.defaultModel);

  const [stage, setStage] = useState<Stage>("pick");
  const [session, setSession] = useState<Session | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const rubric = session ? getRubric(session.rubricId) : undefined;

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}chunks.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`chunks.json 을 불러오지 못했습니다 (${r.status})`);
        return r.json() as Promise<VectorStore>;
      })
      .then(setStore)
      .catch((e: unknown) =>
        setStoreError(
          `자료를 불러오지 못했습니다. ${e instanceof Error ? e.message : String(e)} — npm run embed 를 먼저 실행했는지 확인하세요.`,
        ),
      );
  }, []);

  const recheckOllama = useCallback(() => {
    setOllama({ state: "checking" });
    checkOllama().then(setOllama);
  }, []);

  useEffect(recheckOllama, [recheckOllama]);

  useEffect(() => {
    if (ollama.state === "up" && ollama.models.length > 0 && !ollama.models.includes(model)) {
      setModel(ollama.models[0]);
    }
    // model 을 의존성에 넣으면 사용자가 미설치 모델을 고르는 순간 되돌려 버린다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ollama]);

  const bm25 = useMemo(() => (store ? buildBm25(store.chunks) : null), [store]);
  const chunkIds = useMemo(() => new Set((store?.chunks ?? []).map((c) => c.id)), [store]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [session?.turns.length, thinking]);

  /**
   * 엔진 한 번 호출.
   *
   * 모든 호출이 json 이다. 사고형 모델의 추론이 화면으로 새는 것을 막는
   * 유일하게 확실한 방법이라 스트리밍을 포기했다 (hint.ts 주석 참고).
   */
  const run = useCallback(
    (system: string, user: string, signal: AbortSignal) =>
      engine === "ollama"
        ? ollamaChat({ model, system, user, json: true, signal, onText: () => {}, temperature: 0 })
        : geminiChat({ system, user, json: true, signal, onText: () => {} }),
    [engine, model],
  );

  const patch = useCallback((id: string, next: Partial<Turn>) => {
    setSession((s) =>
      s ? { ...s, turns: s.turns.map((t) => (t.id === id ? { ...t, ...next } : t)) } : s,
    );
  }, []);

  const submit = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || !store || !bm25 || !session || !rubric || busy || session.ending) return;

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);
      setInput("");

      const base: Turn = {
        id,
        kind: "diagnosis",
        input: text,
        attempt: session.attempts,
        scope: null,
        retrieval: null,
        diagnosis: null,
        message: "",
        hintLevel: 0,
        judge: null,
        judgeState: "idle",
        error: null,
        streaming: false,
        engine,
        model: engine === "ollama" ? model : "gemini-2.5-flash",
        createdAt: new Date().toISOString(),
      };
      setSession((s) => (s ? { ...s, turns: [...s.turns, base] } : s));

      let finished: Turn = base;
      const settle = (next: Partial<Turn>) => {
        finished = { ...finished, ...next };
        patch(id, next);
      };

      try {
        setThinking("자료와 맞춰 보는 중…");
        const vector = await embedQuery(text, setEmbedding);
        setEmbedding({ status: "ready", progress: 1, message: "준비 완료" });
        const retrieval = hybridSearch(store, bm25, vector, text);
        const scope = checkScope(text, retrieval);
        settle({ retrieval, scope });

        if (scope.answerDemand || scope.band === "밖") {
          settle({ kind: "refusal", message: refusalMessage(scope) });
        } else if (scope.band === "확인") {
          settle({ kind: "confirm", message: confirmMessage(scope) });
        } else if (!session.easedOnce && tooShortToGrade(text)) {
          // 채점하지 않는다. 아직 설명이라 부를 만한 것이 오지 않았다.
          settle({ kind: "ease", message: rubric.prompt.easedQuestion });
          setSession((s) => (s ? { ...s, easedOnce: true } : s));
        } else {
          setThinking("설명을 읽는 중…");
          const draft = parseDiagnosis(
            await run(buildDiagnosisSystem(rubric), buildDiagnosisUser(text, session.latest), controller.signal),
            rubric,
            text,
          );

          const diagnosis =
            draft.candidates.length > 0
              ? attachCorrections(
                  draft,
                  await run(
                    buildCorrectionSystem(rubric),
                    buildCorrectionUser(draft.candidates, retrieval),
                    controller.signal,
                  ),
                  chunkIds,
                )
              : withoutCorrections(draft);

          settle({ diagnosis });

          const step = decideNext(rubric, session, diagnosis);
          let kind: TurnKind = "diagnosis";
          let message = "";

          if (step.kind === "confirm") {
            kind = "confirm";
            message = step.question;
          } else if (step.kind === "hint") {
            kind = "hint";
            settle({ hintLevel: step.level });
            setThinking("힌트를 고르는 중…");
            message = parseText(
              await run(
                buildHintSystem(rubric, step.target, step.level),
                buildHintUser(text, step.target, step.level, retrieval, rubric),
                controller.signal,
              ),
              "hint",
            );
          } else if (step.kind === "correct") {
            message =
              "필수 요소는 모두 말씀하셨어요. 다만 위에 짚어 드린 부분만 고쳐서 다시 설명해 주세요.";
          } else if (step.kind === "summary") {
            kind = "summary";
            setThinking("정리하는 중…");
            message = parseText(
              await run(
                buildSummarySystem(rubric, step.unmet),
                buildSummaryUser(text, retrieval),
                controller.signal,
              ),
              "summary",
            );
          }

          settle({ kind, message });

          setSession((s) => {
            if (!s) return s;
            const next = { ...s, latest: diagnosis };
            if (step.kind === "confirm") next.confirms = s.confirms + 1;
            else if (step.kind === "achieved") next.ending = "achieved";
            else if (step.kind === "summary") next.ending = "exhausted";
            else if (step.kind === "hint") {
              next.hintLevel = step.level;
              next.attempts = s.attempts + 1;
            } else if (step.kind === "correct") {
              next.attempts = s.attempts + 1;
            }
            return next;
          });
        }

        // 2층 판정은 뒤에서 조용히 돈다. 학습자를 기다리게 하지 않는다.
        setThinking("");
        patch(id, { judgeState: "running" });
        try {
          const judge = parseJudgement(
            await run(JUDGE_SYSTEM, buildJudgeUser(finished, rubric), controller.signal),
          );
          settle({ judge, judgeState: "done" });
        } catch {
          patch(id, { judgeState: "error" });
        }

        upsertLog({
          id,
          at: base.createdAt,
          rubricId: rubric.id,
          rubricVersion: rubric.version,
          kind: finished.kind,
          input: text,
          attempt: base.attempt,
          topCosine: scope.topCosine,
          band: scope.band,
          states: (finished.diagnosis?.elements ?? []).map((e) => `${e.elementId}:${e.state}`),
          misconceptions: (finished.diagnosis?.misconceptions ?? []).map((m) => m.quote),
          judge: finished.judge,
          engine,
          model: engine === "ollama" ? model : "gemini-2.5-flash",
          feedback: null,
        });
      } catch (e: unknown) {
        const aborted = e instanceof DOMException && e.name === "AbortError";
        if (!aborted) {
          const msg = e instanceof Error ? e.message : String(e);
          setEmbedding((p) => (p.status === "downloading" ? { ...p, status: "error" } : p));
          patch(id, { error: msg, judgeState: "idle" });
          if (engine === "ollama") recheckOllama();
        }
      } finally {
        abortRef.current = null;
        setThinking("");
        setBusy(false);
      }
    },
    [store, bm25, session, rubric, busy, engine, model, run, patch, chunkIds, recheckOllama],
  );

  const start = (rubricId: string, go: Stage) => {
    setSession(newSession(rubricId));
    setStage(go);
  };

  const reset = () => {
    setSession(null);
    setStage("pick");
    setInput("");
  };

  const unmet = rubric ? unmetRequired(rubric, session?.latest ?? null) : [];

  return (
    <div className="shell">
      {stage !== "pick" && (
        <header className="masthead">
          <h1>
            {domain.brand.emoji} {domain.brand.title}
          </h1>
          <button className="chip ghost" onClick={reset}>
            처음으로
          </button>
        </header>
      )}

      <div className={stage === "pick" ? "single" : "columns"}>
        {stage !== "pick" && (
          <aside className="aside">
            {rubric && session && stage === "work" && (
              <ResultPanel
                rubric={rubric}
                diagnosis={session.latest}
                ending={session.ending}
              />
            )}

            {/* 학습에 필요하지 않은 것은 접어 둔다. 화면에 있으면 읽어야 할 것처럼 보인다. */}
            <details className="card fold">
              <summary>설정과 기록</summary>
              <div className="fold-body">
                <EnginePanel
                  engine={engine}
                  setEngine={setEngine}
                  model={model}
                  setModel={setModel}
                  ollama={ollama}
                  onRecheck={recheckOllama}
                  embedding={embedding}
                />
                <LogPanel />
              </div>
            </details>
          </aside>
        )}

        <main>
          {storeError && <div className="error-banner">{storeError}</div>}

          {stage === "pick" && (
            <ConceptPicker
              rubrics={RUBRICS}
              store={store}
              onRead={(id) => start(id, "read")}
              onExplain={(id) => start(id, "work")}
            />
          )}

          {stage === "read" && rubric && (
            <SourceIntro
              rubric={rubric}
              store={store}
              onExplain={() => setStage("work")}
              onDone={reset}
            />
          )}

          {stage === "work" && rubric && session && (
            <>
              <div className="turns">
                <article className="card prompt-card">
                  <p className="ask">{rubric.prompt.question}</p>
                  <p className="hint">틀려도 괜찮아요.</p>
                  {/* 코드는 질문이 아니라 막혔을 때 여는 예다. 앞에 두면 개념을
                      설명하러 온 사람에게 퀴즈를 내는 화면이 된다. */}
                  {rubric.prompt.snippet && (
                    <details className="fold example">
                      <summary>{rubric.prompt.exampleLabel ?? "예 보기"}</summary>
                      <div className="fold-body">
                        <pre className="export">{rubric.prompt.snippet}</pre>
                        <p className="hint">{rubric.prompt.expected}</p>
                      </div>
                    </details>
                  )}
                </article>

                {session.turns.map((t) => (
                  <TurnCard key={t.id} turn={t} rubric={rubric} />
                ))}

                {thinking && (
                  <p className="thinking">
                    <i className="caret" /> {thinking}
                  </p>
                )}
                <div ref={endRef} />
              </div>

              {session.ending ? (
                <div className={session.ending === "achieved" ? "card done" : "warn-banner"}>
                  {session.ending === "achieved" ? (
                    <p style={{ margin: 0 }}>
                      다 설명하셨어요. 이 개념은 여기서 끝냅니다.
                    </p>
                  ) : (
                    <p style={{ margin: 0 }}>
                      힌트를 다 쓰셨어요. 남은 {unmet.length}개는 “다시 볼 항목”으로 남겨 두었습니다.
                    </p>
                  )}
                  <div className="chips" style={{ marginTop: 10 }}>
                    <button className="chip" onClick={reset}>
                      다른 개념 해보기
                    </button>
                    <a
                      className="chip"
                      href={rubric.source.url}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      원문 다시 보기
                    </a>
                  </div>
                </div>
              ) : (
                <>
                  <form
                    className="composer"
                    onSubmit={(e) => {
                      e.preventDefault();
                      submit(input);
                    }}
                  >
                    <textarea
                      value={input}
                      rows={2}
                      placeholder={
                        session.turns.length === 0
                          ? "아는 만큼 적어 보세요"
                          : "다시 설명해 보세요"
                      }
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          submit(input);
                        }
                      }}
                    />
                    {busy ? (
                      <button type="button" className="stop" onClick={() => abortRef.current?.abort()}>
                        중지
                      </button>
                    ) : (
                      <button type="submit" disabled={!store || !input.trim()}>
                        보내기
                      </button>
                    )}
                  </form>
                  {session.attempts > 0 && (
                    <p className="hint" style={{ textAlign: "right", margin: 0 }}>
                      다시 설명 {session.attempts}/{MAX_RETRIES}
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
