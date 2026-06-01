import { readdir, rm } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");

const generatedPatterns = [
  /^sw\.js(\.map)?$/,
  /^workbox-.+\.js(\.map)?$/,
  /^fallback-.+\.js$/,
  /^swe-worker-.+\.js(\.map)?$/,
];

try {
  const entries = await readdir(publicDir);
  await Promise.all(
    entries
      .filter((entry) => generatedPatterns.some((pattern) => pattern.test(entry)))
      .map((entry) => rm(join(publicDir, entry), { force: true }))
  );
} catch {
  /* public directory is optional during early setup */
}
