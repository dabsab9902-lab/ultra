import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

const DEFAULT_ENV = "ADMIN_LOGIN=admin\nADMIN_PASSWORD=1234\n";
const files = [".env.local", ".env.local.example"];

for (const file of files) {
  const path = join(rootDir, file);
  if (!existsSync(path)) {
    writeFileSync(path, DEFAULT_ENV, "utf-8");
    console.log(`Created ${file}`);
    continue;
  }

  const current = readFileSync(path, "utf-8");
  const additions = [];
  if (!/^ADMIN_LOGIN=/m.test(current)) additions.push("ADMIN_LOGIN=admin");
  if (!/^ADMIN_PASSWORD=/m.test(current)) additions.push("ADMIN_PASSWORD=1234");

  if (additions.length > 0) {
    const next = `${current.trimEnd()}\n${additions.join("\n")}\n`;
    writeFileSync(path, next, "utf-8");
    console.log(`Updated ${file}`);
  }
}
