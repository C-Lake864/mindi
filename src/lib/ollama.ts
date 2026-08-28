import { domain } from "../config/domain";

export type OllamaStatus =
  | { state: "checking" }
  | { state: "up"; models: string[] }
  | { state: "down"; reason: string };

/**
 * Ollama가 살아 있는지, 어떤 모델이 있는지 본다.
 *
 * 여기서 실패하는 이유는 대개 두 가지다. Ollama가 꺼져 있거나,
 * 켜져 있어도 이 페이지 출처를 OLLAMA_ORIGINS 가 허용하지 않아 브라우저가
 * 요청을 막는 경우다. 둘은 사용자가 할 일이 다르므로 구분해서 알린다.
 */
export async function checkOllama(baseUrl = domain.ollama.baseUrl): Promise<OllamaStatus> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return { state: "down", reason: `Ollama가 ${res.status} 를 돌려주었습니다.` };
    const data = (await res.json()) as { models?: { name: string }[] };
    return { state: "up", models: (data.models ?? []).map((m) => m.name) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const remote = location.protocol === "https:" || location.hostname !== "localhost";
    return {
      state: "down",
      reason: remote
        ? "Ollama에 연결하지 못했습니다. Ollama가 실행 중이 아니거나, 이 페이지 출처가 OLLAMA_ORIGINS 에 허용되지 않았습니다."
        : `Ollama에 연결하지 못했습니다. (${msg})`,
    };
  }
}

/**
 * 사고 과정을 답변에서 걷어낸다.
 *
 * 사고형 모델은 추론을 먼저 뱉고 `</think>` 뒤에 답을 쓴다. Ollama의
 * `think:false` 요청 옵션은 빌드와 모델에 따라 무시되는 일이 있어(0.33.1의
 * qwen3:4b가 그렇다) 받는 쪽에서도 한 번 더 걸러야 안전하다.
 *
 * 스트리밍 중에는 아직 `</think>`가 오지 않아 추론인지 답인지 구분할 수 없다.
 * 그래서 일단 보여 주고, 닫는 태그가 나타나면 그 앞을 통째로 버린다.
 * 누적 텍스트 전체를 매번 다시 계산하므로 뒤늦은 제거가 가능하다.
 */
export function stripThinking(raw: string): string {
  const close = raw.lastIndexOf("</think>");
  if (close >= 0) return raw.slice(close + "</think>".length).replace(/^\s+/, "");
  if (raw.trimStart().startsWith("<think>")) return "";
  return raw;
}

/** Qwen3 계열은 프롬프트 안의 `/no_think` 로 사고를 끌 수 있다. */
function withThinkingSwitch(model: string, user: string): string {
  return /qwen3/i.test(model) ? `${user}\n\n/no_think` : user;
}

/**
 * 연결이 왜 안 되는지 가른다.
 *
 * 브라우저는 CORS 로 막힌 요청과 서버가 꺼져 있는 요청을 똑같이
 * TypeError("Failed to fetch") 로 돌려준다. 사용자에게는 완전히 다른 상황인데
 * 화면에는 같은 말이 뜬다.
 *
 * `mode: "no-cors"` 로 한 번 더 두드려 보면 갈린다. 서버가 살아 있으면
 * 불투명 응답이 돌아오고(성공), 꺼져 있으면 그때는 진짜로 던진다.
 */
export type ConnectionProblem = "cors" | "down";

export async function diagnoseConnection(baseUrl = domain.ollama.baseUrl): Promise<ConnectionProblem> {
  try {
    await fetch(`${baseUrl}/api/tags`, { mode: "no-cors", signal: AbortSignal.timeout(4000) });
    return "cors";
  } catch {
    return "down";
  }
}

/** 무엇을 해야 하는지까지 적는다. 원인만 알려 주는 오류는 쓸모가 없다. */
export function connectionHelp(problem: ConnectionProblem, model: string): string {
  const origin = location.origin;
  if (problem === "down") {
    return [
      "Ollama가 실행되고 있지 않은 것 같아요.",
      "",
      `Ollama를 켜고 \`ollama pull ${model}\` 로 모델을 받아 두세요.`,
      "켜져 있는데도 이 말이 나오면 방화벽이 11434 포트를 막고 있는지 봐 주세요.",
    ].join("\n");
  }
  return [
    "Ollama는 켜져 있는데, 이 페이지에서 부르는 것을 아직 허용하지 않았어요.",
    "",
    `Ollama가 ${origin} 주소를 허용하도록 아래를 실행해 주세요.`,
    "",
    `    setx OLLAMA_ORIGINS "${origin}"`,
    "",
    "그다음 Ollama를 완전히 종료했다가 다시 실행해야 반영됩니다.",
    "(작업 표시줄 아이콘 오른쪽 클릭 → Quit)",
  ].join("\n");
}

export type ChatArgs = {
  baseUrl?: string;
  model: string;
  system: string;
  user: string;
  signal?: AbortSignal;
  /** 누적된 "보여 줄" 전체 텍스트를 넘긴다. 조각이 아니라 전체인 이유는 위 stripThinking 참고. */
  onText: (visibleFull: string) => void;
  /** 판정처럼 형식이 중요한 호출에서 JSON 강제 */
  json?: boolean;
  temperature?: number;
};

/** NDJSON 스트림을 읽어 답변을 흘려보낸다. 반환값은 사고 과정을 뺀 최종 답변이다. */
export async function ollamaChat({
  baseUrl = domain.ollama.baseUrl,
  model,
  system,
  user,
  signal,
  onText,
  json = false,
  temperature = 0.2,
}: ChatArgs): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        model,
        stream: true,
        think: false, // 이 옵션을 지키는 빌드에서는 여기서 끝난다
        ...(json ? { format: "json" } : {}),
        options: { temperature },
        messages: [
          { role: "system", content: system },
          { role: "user", content: withThinkingSwitch(model, user) },
        ],
      }),
    });
  } catch (e) {
    // 취소는 오류가 아니다. 그대로 올려 보낸다.
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    // "Failed to fetch" 를 그대로 보여 주면 사용자는 할 수 있는 일이 없다.
    throw new Error(connectionHelp(await diagnoseConnection(baseUrl), model));
  }

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`Ollama 응답 오류 ${res.status}. ${body.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let raw = "";
  let shown = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let payload: { message?: { content?: string }; error?: string };
      try {
        payload = JSON.parse(line);
      } catch {
        continue;
      }
      if (payload.error) throw new Error(payload.error);
      // message.thinking 은 일부러 읽지 않는다. 사고 과정은 답변이 아니다.
      const piece = payload.message?.content;
      if (!piece) continue;
      raw += piece;
      const next = stripThinking(raw);
      if (next !== shown) {
        shown = next;
        onText(shown);
      }
    }
  }
  return shown;
}
