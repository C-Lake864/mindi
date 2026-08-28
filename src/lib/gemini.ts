/**
 * 선택 엔진. 기본 경로는 로컬 Ollama만으로 완결되지만, 같은 질문을
 * 다른 모델에 넣어 보면 답변 리듬과 판정 결과가 어떻게 갈리는지 볼 수 있다.
 *
 * API 키는 브라우저 localStorage에만 두고 어디에도 보내지 않는다.
 * (요청은 사용자의 브라우저에서 Google 서버로 직접 나간다.)
 */
const KEY_STORAGE = "rgc.geminiKey";
const MODEL = "gemini-2.5-flash";

export function getGeminiKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function setGeminiKey(key: string) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* 저장 불가 환경(시크릿 창 등)에서는 이번 세션에만 쓰지 못한다 */
  }
}

export async function geminiChat({
  system,
  user,
  signal,
  onText,
  json = false,
}: {
  system: string;
  user: string;
  signal?: AbortSignal;
  /** 누적된 전체 텍스트를 넘긴다. Ollama 쪽과 계약을 맞춰 App 이 엔진을 몰라도 되게 한다. */
  onText: (visibleFull: string) => void;
  json?: boolean;
}): Promise<string> {
  const key = getGeminiKey();
  if (!key) throw new Error("Gemini API 키가 없습니다. 설정에서 키를 입력하세요.");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse`,
    {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.2,
          ...(json ? { responseMimeType: "application/json" } : {}),
        },
      }),
    },
  );

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gemini 응답 오류 ${res.status}. ${body.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === "[DONE]") continue;
      try {
        const payload = JSON.parse(raw) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        for (const part of payload.candidates?.[0]?.content?.parts ?? []) {
          if (part.text) {
            full += part.text;
            onText(full);
          }
        }
      } catch {
        continue;
      }
    }
  }
  return full;
}
