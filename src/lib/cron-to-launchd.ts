// Pure-function translator from standard 5-field cron expressions to
// launchd StartCalendarInterval dictionary entries.
//
// Supported:
//   - Standard 5-field cron: minute hour day month weekday
//   - '*' (every value) — omitted from the resulting interval
//   - Specific integers: "0 9 * * *"
//   - Lists: "0,15,30,45 * * * *"
//   - Ranges: "0-5 * * * *"
//   - Step values: "*/15 * * * *" (and "0-30/5" forms)
//
// Unsupported (returns ok: false):
//   - Special strings like @reboot, @hourly, @yearly
//   - Nicknames, L (last), W (weekday), # (nth weekday) extensions
//   - Combined day-of-month AND day-of-week (semantic mismatch: cron = OR, launchd = AND)

export type LaunchdCalendarInterval = {
  Minute?: number;
  Hour?: number;
  Day?: number;
  Weekday?: number; // launchd: 0 (Sunday) to 7 (Saturday, also valid as Sunday)
  Month?: number;
};

export type TranslationResult =
  | { ok: true; intervals: LaunchdCalendarInterval[] }
  | { ok: false; error: string };

type FieldName = 'minute' | 'hour' | 'day' | 'month' | 'weekday';

type FieldSpec = {
  name: FieldName;
  min: number;
  max: number;
};

const FIELD_SPECS: readonly FieldSpec[] = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'weekday', min: 0, max: 7 },
] as const;

type ParsedField =
  | { wildcard: true }
  | { wildcard: false; values: number[] };

function parseSingleValue(token: string, spec: FieldSpec): number | string {
  if (!/^\d+$/.test(token)) {
    return `Field '${spec.name}' has non-numeric token '${token}'`;
  }
  const v = Number.parseInt(token, 10);
  if (v < spec.min || v > spec.max) {
    return `Field '${spec.name}' value ${v} out of range ${spec.min}-${spec.max}`;
  }
  return v;
}

function expandRange(start: number, end: number, step: number): number[] {
  const result: number[] = [];
  if (step <= 0) return result;
  for (let v = start; v <= end; v += step) result.push(v);
  return result;
}

function parseTerm(term: string, spec: FieldSpec): number[] | string {
  // Handle step: e.g. "*/15" or "0-30/5" or "5/10"
  let stepStr: string | null = null;
  let base = term;
  const slashIdx = term.indexOf('/');
  if (slashIdx >= 0) {
    base = term.slice(0, slashIdx);
    stepStr = term.slice(slashIdx + 1);
  }
  let step = 1;
  if (stepStr !== null) {
    if (!/^\d+$/.test(stepStr)) {
      return `Field '${spec.name}' has invalid step '${stepStr}'`;
    }
    step = Number.parseInt(stepStr, 10);
    if (step <= 0) return `Field '${spec.name}' step must be positive`;
  }

  let start: number;
  let end: number;
  if (base === '*') {
    start = spec.min;
    end = spec.max;
  } else if (base.includes('-')) {
    const [s, e] = base.split('-', 2);
    const sv = parseSingleValue(s, spec);
    const ev = parseSingleValue(e, spec);
    if (typeof sv === 'string') return sv;
    if (typeof ev === 'string') return ev;
    if (sv > ev) return `Field '${spec.name}' range ${sv}-${ev} is inverted`;
    start = sv;
    end = ev;
  } else {
    const v = parseSingleValue(base, spec);
    if (typeof v === 'string') return v;
    if (stepStr === null) return [v];
    start = v;
    end = spec.max;
  }

  return expandRange(start, end, step);
}

function parseField(field: string, spec: FieldSpec): ParsedField | string {
  if (field === '*') return { wildcard: true };
  // Reject cron-extension special chars we don't support
  if (/[LW#?]/i.test(field)) {
    return `Field '${spec.name}' uses unsupported cron extension ('${field}')`;
  }
  const terms = field.split(',');
  const all = new Set<number>();
  for (const t of terms) {
    const parsed = parseTerm(t.trim(), spec);
    if (typeof parsed === 'string') return parsed;
    for (const v of parsed) all.add(v);
  }
  if (all.size === 0) return `Field '${spec.name}' produced no values`;
  // Detect wildcard-equivalent expansions (full range) and collapse them.
  const expectedCount = spec.max - spec.min + 1;
  if (all.size === expectedCount) return { wildcard: true };
  return { wildcard: false, values: Array.from(all).sort((a, b) => a - b) };
}

function cartesian<T>(arrays: T[][]): T[][] {
  return arrays.reduce<T[][]>(
    (acc, cur) => acc.flatMap((prefix) => cur.map((v) => [...prefix, v])),
    [[]]
  );
}

export function cronToLaunchd(cronExpression: string): TranslationResult {
  if (typeof cronExpression !== 'string') {
    return { ok: false, error: 'Cron expression must be a string' };
  }
  const trimmed = cronExpression.trim();
  if (!trimmed) return { ok: false, error: 'Cron expression is empty' };

  if (trimmed.startsWith('@')) {
    return {
      ok: false,
      error: `Cron nicknames like '${trimmed}' are not supported — use 5-field syntax`,
    };
  }

  const fields = trimmed.split(/\s+/);
  if (fields.length !== 5) {
    return {
      ok: false,
      error: `Expected 5 cron fields (minute hour day month weekday), got ${fields.length}`,
    };
  }

  const parsed: ParsedField[] = [];
  for (let i = 0; i < 5; i += 1) {
    const result = parseField(fields[i], FIELD_SPECS[i]);
    if (typeof result === 'string') return { ok: false, error: result };
    parsed.push(result);
  }

  const [mField, hField, dField, moField, wField] = parsed;

  // Semantic mismatch: cron OR-s day-of-month with day-of-week when both are specific,
  // but launchd AND-s them. Reject rather than silently changing behavior.
  if (!dField.wildcard && !wField.wildcard) {
    return {
      ok: false,
      error:
        'Cron combines day-of-month and day-of-week with OR semantics, but launchd uses AND. Refusing to translate ambiguously — schedule two separate actions instead.',
    };
  }

  const keys: FieldName[] = ['minute', 'hour', 'day', 'month', 'weekday'];
  const valueSets: number[][] = [];
  const activeKeys: FieldName[] = [];
  for (let i = 0; i < 5; i += 1) {
    if (!parsed[i].wildcard) {
      valueSets.push((parsed[i] as { wildcard: false; values: number[] }).values);
      activeKeys.push(keys[i]);
    }
  }

  // All wildcards: run every minute (single empty interval won't trigger cleanly in launchd,
  // so emit { Minute: 0..59 } — but more sensibly, emit a single Minute=0 hour wildcard)
  // For safety, if everything is wildcard, emit 60 entries (every minute).
  if (valueSets.length === 0) {
    const intervals: LaunchdCalendarInterval[] = [];
    for (let m = 0; m <= 59; m += 1) intervals.push({ Minute: m });
    return { ok: true, intervals };
  }

  const combos = cartesian(valueSets);
  const intervals: LaunchdCalendarInterval[] = combos.map((combo) => {
    const entry: LaunchdCalendarInterval = {};
    combo.forEach((value, idx) => {
      const key = activeKeys[idx];
      switch (key) {
        case 'minute':
          entry.Minute = value;
          break;
        case 'hour':
          entry.Hour = value;
          break;
        case 'day':
          entry.Day = value;
          break;
        case 'month':
          entry.Month = value;
          break;
        case 'weekday':
          entry.Weekday = value;
          break;
      }
    });
    return entry;
  });

  // Suppress unused warnings for destructured names kept for readability.
  void mField;
  void hField;
  void moField;

  return { ok: true, intervals };
}
