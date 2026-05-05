const PORT_RAW = Bun.env.PORT;
const port = PORT_RAW ? Number.parseInt(PORT_RAW, 10) : 3000;
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT: ${PORT_RAW}`);
}

const NODE_ENV = Bun.env.NODE_ENV ?? "development";
const DATABASE_PATH = Bun.env.DATABASE_PATH ?? "./tasks.db";

export const env = {
  PORT: port,
  DATABASE_PATH,
  NODE_ENV,
  IS_DEV: NODE_ENV !== "production",
} as const;
