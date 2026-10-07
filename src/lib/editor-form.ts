import type { Bell } from "./bells";

export interface BellRow {
  key: string;
  minutes: string;
  seconds: string;
  count: number;
}

export interface FormErrors {
  name?: string;
  rows: Record<number, string>;
  general?: string;
}

let keySeq = 0;

export function newRow(atSeconds: number, count: number): BellRow {
  keySeq += 1;
  return {
    key: `row-${keySeq}`,
    minutes: String(Math.floor(atSeconds / 60)),
    seconds: String(atSeconds % 60),
    count,
  };
}

export function templateToRows(bells: readonly Bell[]): BellRow[] {
  return bells.map((bell) => newRow(bell.at, bell.count));
}

/** 空欄は 0、0 以上の整数以外は NaN。 */
function parsePart(value: string): number {
  const trimmed = value.trim();
  if (trimmed === "") return 0;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

function rowToSeconds(row: BellRow): number {
  const minutes = parsePart(row.minutes);
  const seconds = parsePart(row.seconds);
  if (seconds > 59) return Number.NaN;
  return minutes * 60 + seconds;
}

/** フォームの状態を templateInputSchema に渡せる形に変換する（検証はしない）。 */
export function rowsToCandidate(name: string, rows: readonly BellRow[]) {
  return {
    name,
    bells: rows.map((row) => ({ at: rowToSeconds(row), count: row.count })),
  };
}

export function issuesToErrors(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): FormErrors {
  const errors: FormErrors = { rows: {} };
  for (const issue of issues) {
    const [head, index] = issue.path;
    if (head === "name") {
      errors.name ??= issue.message;
    } else if (head === "bells" && typeof index === "number") {
      errors.rows[index] ??= issue.message;
    } else {
      errors.general ??= issue.message;
    }
  }
  return errors;
}
