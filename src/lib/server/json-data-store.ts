import { constants } from "fs";
import { access, copyFile, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join } from "path";

const TMP_DATA_DIR = "ultra-svet-data";

export function getBundledDataFilePath(fileName: string) {
  return join(process.cwd(), "data", fileName);
}

export function getRuntimeDataFilePath(fileName: string) {
  if (isVercelRuntime()) {
    return join(tmpdir(), TMP_DATA_DIR, fileName);
  }

  return getBundledDataFilePath(fileName);
}

export function getRuntimeDataStoreInfo(fileName: string) {
  const vercel = isVercelRuntime();

  return {
    filePath: getRuntimeDataFilePath(fileName),
    durable: !vercel,
    runtime: vercel ? "vercel-tmp" : "local-file",
  };
}

export async function ensureRuntimeDataFile(
  fileName: string,
  fallbackContent: string
) {
  const targetPath = getRuntimeDataFilePath(fileName);
  await mkdir(dirname(targetPath), { recursive: true });

  try {
    await access(targetPath, constants.F_OK);
    return targetPath;
  } catch {
    /* seed below */
  }

  const bundledPath = getBundledDataFilePath(fileName);
  try {
    await copyFile(bundledPath, targetPath);
  } catch {
    await writeFile(targetPath, fallbackContent, "utf-8");
  }

  return targetPath;
}

export function isVercelRuntime() {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
}
