export function createLogger({ silent = false } = {}) {
  const write = (level, message, meta) => {
    if (silent) return;
    const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
    console.log(`[parser:${level}] ${message}${suffix}`);
  };

  return {
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta) => write("error", message, meta),
    progress: (event) => {
      if (!silent && event) console.log(`[parser:progress] ${JSON.stringify(event)}`);
    },
  };
}
