import axios from "axios";
import { USER_AGENT } from "./config.mjs";

export const client = axios.create({
  timeout: 6000,
  maxRedirects: 5,
  responseType: "text",
  headers: {
    "User-Agent": USER_AGENT,
    "Accept-Language": "uk-UA,uk;q=0.9,ru;q=0.8,en;q=0.7",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  },
});

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchHtml(url, { retries = 2, delay = 1000, logger } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      if (attempt > 0) logger?.warn("retry request", { url, attempt });
      const { data } = await client.get(url);
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(delay * (attempt + 1));
    }
  }
  throw lastError;
}
