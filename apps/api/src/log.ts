type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const serialize = (fields: Fields | undefined): Fields => {
  const out: Fields = {};
  if (!fields) return out;
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    if (v instanceof Error) {
      out[k] = { name: v.name, message: v.message, stack: v.stack };
      continue;
    }
    out[k] = v;
  }
  return out;
};

const emit = (level: Level, msg: string, fields?: Fields): void => {
  const extra = serialize(fields);
  delete extra.level;
  delete extra.msg;
  delete extra.ts;
  const line = JSON.stringify({ level, msg, ts: Date.now(), ...extra });
  process.stdout.write(`${line}\n`);
};

export const logger = {
  info: (msg: string, fields?: Fields): void => {
    emit("info", msg, fields);
  },
  warn: (msg: string, fields?: Fields): void => {
    emit("warn", msg, fields);
  },
  error: (msg: string, fields?: Fields): void => {
    emit("error", msg, fields);
  },
} as const;
