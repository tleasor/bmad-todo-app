// Enforces NFR-M1: project-wide coverage threshold across both apps.
// Bun 1.3.11's built-in coverageThreshold (CLI flag and bunfig.toml) does not
// fail the run on shortfall, so we parse the text-format "All files" summary
// from `bun test --coverage` and exit non-zero ourselves.

const THRESHOLD = 0.7;
const SUMMARY_REGEX = /^All files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/;

// `--conditions=browser` is required so solid-js's package.json `exports` resolves
// to its client build for component tests. Bun's default condition set is node-first,
// which breaks @solidjs/testing-library render() with "Client-only API called on the
// server side". Backend tests are unaffected by the extra condition.
const proc = Bun.spawn(["bun", "test", "apps", "--coverage", "--conditions=browser"], {
  stdout: "pipe",
  stderr: "pipe",
  // Pin locale so decimal/grouping separators don't drift the regex.
  env: { ...process.env, LANG: "C", LC_ALL: "C" },
});

let summaryLine: string | null = null;

const tee = async (
  reader: ReadableStream<Uint8Array> | null,
  out: NodeJS.WriteStream,
): Promise<void> => {
  if (!reader) return;
  const decoder = new TextDecoder();
  let buf = "";
  for await (const chunk of reader) {
    const text = decoder.decode(chunk, { stream: true });
    out.write(text);
    buf += text;
    let nl = buf.indexOf("\n");
    while (nl !== -1) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!summaryLine && SUMMARY_REGEX.test(line)) summaryLine = line;
      nl = buf.indexOf("\n");
    }
  }
  if (buf && !summaryLine && SUMMARY_REGEX.test(buf)) summaryLine = buf;
};

await Promise.all([tee(proc.stdout, process.stdout), tee(proc.stderr, process.stderr)]);
const exitCode = await proc.exited;

if (exitCode !== 0) process.exit(exitCode);

if (!summaryLine) {
  process.stderr.write("Coverage summary line not found in output\n");
  process.exit(1);
}

const match = summaryLine.match(SUMMARY_REGEX);
const funcsPct = match ? Number(match[1]) / 100 : Number.NaN;
const linesPct = match ? Number(match[2]) / 100 : Number.NaN;

if (!Number.isFinite(funcsPct) || !Number.isFinite(linesPct)) {
  process.stderr.write(`Coverage values not finite (line: ${summaryLine})\n`);
  process.exit(1);
}

process.stdout.write(
  `Coverage: funcs ${(funcsPct * 100).toFixed(2)}%, lines ${(linesPct * 100).toFixed(2)}% (threshold ${(THRESHOLD * 100).toFixed(0)}%)\n`,
);

if (funcsPct < THRESHOLD || linesPct < THRESHOLD) {
  process.stderr.write(`FAIL: coverage below threshold ${(THRESHOLD * 100).toFixed(0)}%\n`);
  process.exit(1);
}
process.stdout.write("Coverage check passed.\n");
process.exit(0);
