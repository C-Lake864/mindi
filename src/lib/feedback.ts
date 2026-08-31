import type { Appeal, Feedback, Judgement, ScopeBand, TurnKind } from "./types";

const STORAGE = "webcheck.log.v1";

/**
 * 실험 기록 한 줄.
 *
 * 1층 판정(요소별 상태)과 2층 판정(진단의 근거성)을 같은 줄에 둔다.
 * 둘이 어긋나는 지점 — 진단은 pass 인데 요소 판정이 틀린 경우 — 이
 * 실험의 재료다.
 */
export type LogEntry = {
  id: string;
  at: string;
  rubricId: string;
  rubricVersion: string;
  kind: TurnKind;
  input: string;
  attempt: number;
  topCosine: number;
  band: ScopeBand;
  states: string[];
  misconceptions: string[];
  judge: Judgement | null;
  /** 이의 제기 기록. 받아들여진 이의는 루브릭 개선의 재료다 */
  appeals: Appeal[];
  engine: string;
  model: string;
  feedback: Feedback;
};

function read(): LogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE);
    return raw ? (JSON.parse(raw) as LogEntry[]) : [];
  } catch {
    return [];
  }
}

function write(entries: LogEntry[]) {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(entries.slice(-300)));
  } catch {
    /* 저장 공간이 없거나 막힌 브라우저에서는 화면 표시만 유지한다 */
  }
}

export function upsertLog(entry: LogEntry) {
  const all = read();
  const i = all.findIndex((e) => e.id === entry.id);
  if (i >= 0) all[i] = entry;
  else all.push(entry);
  write(all);
}

export function readLog(): LogEntry[] {
  return read();
}

export function clearLog() {
  write([]);
}

const mark = (b: boolean | undefined) => (b === undefined ? "-" : b ? "O" : "X");
/** 표 안에서 칸을 깨뜨리는 글자를 눕힌다. */
const esc = (t: string) => t.replace(/\|/g, "\\|").replace(/\s+/g, " ");

/**
 * 루브릭 개선 로그.
 *
 * 받아들여진 이의가 모이는 요소는 판정 기준이 모호하다는 뜻이다.
 * 프롬프트가 아니라 루브릭을 먼저 고치라는 신호로 읽는다 (PRD 6.4 원칙 5).
 */
export function appealLog(entries: LogEntry[]): string {
  const rows = entries.flatMap((e) =>
    (e.appeals ?? []).map((a) => ({ ...a, rubricId: e.rubricId, input: e.input })),
  );
  if (rows.length === 0) return "이의 제기 기록이 없습니다.";

  const byElement = new Map<string, { ok: number; no: number }>();
  for (const r of rows) {
    const k = `${r.rubricId}/${r.elementId}`;
    const c = byElement.get(k) ?? { ok: 0, no: 0 };
    if (r.accepted) c.ok++;
    else c.no++;
    byElement.set(k, c);
  }

  const summary = [
    "| 요소 | 받아들임 | 기각 | 읽는 법 |",
    "| --- | --- | --- | --- |",
    ...[...byElement.entries()].map(([k, c]) =>
      `| ${k} | ${c.ok} | ${c.no} | ${c.ok >= 2 ? "**판정 기준이 모호할 수 있음 — 루브릭 검토**" : "-"} |`,
    ),
  ];

  const detail = [
    "",
    "| 요소 | 학습자 해명 | 결과 | 사유 |",
    "| --- | --- | --- | --- |",
    ...rows.map(
      (r) =>
        `| ${r.elementId} | ${esc(r.rebuttal).slice(0, 40)} | ${r.accepted ? "받아들임" : "기각"}${r.overturned ? " (코드가 되돌림)" : ""} | ${esc(r.reason).slice(0, 50)} |`,
    ),
  ];

  return [...summary, ...detail].join("\n");
}

/** README 실험 절에 그대로 붙일 수 있는 표. */
export function toMarkdown(entries: LogEntry[]): string {
  if (entries.length === 0) return "기록이 없습니다.";

  const head = [
    "| 입력 | 개념 | 유형 | 유사도/구간 | 요소 상태 | grounded | cited | refusal | complete | verdict | 사람 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  const rows = entries.map((e) => {
    const j = e.judge;
    const human = e.feedback === "up" ? "O" : e.feedback === "down" ? "X" : "-";
    const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
    return [
      esc(e.input.slice(0, 40)),
      `${e.rubricId} v${e.rubricVersion}`,
      e.kind,
      `${e.topCosine.toFixed(3)} ${e.band}`,
      esc(e.states.join(" ")) || "-",
      mark(j?.grounded),
      mark(j?.cited),
      mark(j?.refusal),
      mark(j?.complete),
      j?.verdict ?? "-",
      human,
    ].join(" | ");
  });

  return [...head, ...rows.map((r) => `| ${r} |`)].join("\n");
}
