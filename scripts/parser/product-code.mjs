const CYR_CABLE_MARKS =
  "\\u0428\\u0412\\u0412\\u041f|\\u041f\\u0412\\u0421|\\u0412\\u0412\\u0413\\u041d\\u0413|\\u0412\\u0412\\u0413|\\u0421\\u0418\\u041f|\\u041f\\u04123\\u041d\\u0413-LS|\\u041f\\u04123|\\u041f\\u0412|\\u041a\\u0413";

const CODE_PATTERNS = [
  { re: /\b(?:LMA|LMR|LMK|LMP|LMI|LSP|LM)\s*[-.]?\s*\d+[A-Z0-9/-]*(?:\([A-Z0-9/-]+\))?/gi, score: 120 },
  { re: /\b(?:MCN|ESC|MCS|HDC|HDA|HNA)\s*[-.]?\s*\d+[A-Z0-9/-]*\b/gi, score: 120 },
  { re: /\b(?:R9F|A9|EPH|ERN|NU|SDN|MGU|UNICA)\s*[-.]?\s*\d+[A-Z0-9/-]*\b/gi, score: 120 },
  { re: /\bMG\s*[-.]?\s*\d+[A-Z0-9/-]*\b/gi, score: 120 },
  { re: /\b[A-Z]{1,6}\s+\d{1,6}[A-Z0-9/-]*(?:-[A-Z0-9]+)?\b/gi, score: 118 },
  { re: /\b\d{3}-\d{4}-\d{3,4}\b/g, score: 115 },
  { re: /\b\d{2,4}-[A-Z]\d{2,4}-\d{2,4}\b/gi, score: 115 },
  { re: /\b\d{1,4}-\d{1,4}(?:-\d{1,4})?\b/g, score: 96 },
  { re: /\b\d{2,4}-\d{2,4}\b/g, score: 95 },
  { re: /\bESS\s*\d+\/\d+(?:KWH)?\b/gi, score: 95 },
  { re: /\b(?:NL|MG|J)\d+[A-Z0-9/-]*\b/gi, score: 90 },
  { re: /\b[A-Z]{1,5}-?\d{1,10}[A-Z0-9/-]*\b/gi, score: 78 },
  { re: /[\u0420\u0440][\u0417\u0437][\u043b\u041B]?-[\u0426\u0446]-\d{3,5}/giu, score: 125 },
  { re: /\bE\.[A-Z0-9]+(?:\.[A-Z0-9]+){1,8}\b/gi, score: 85 },
  { re: /\b[PSI]\d{6,8}\b/gi, score: 110 },
  { re: /\b[A-Z]{2,6}[-.]?\d{2,8}[A-Z0-9/-]*\b/gi, score: 80 },
  { re: /\b[A-Z]\d[A-Z]\d{2,8}[A-Z0-9/-]*\b/gi, score: 80 },
  {
    re: new RegExp(
      `(?:${CYR_CABLE_MARKS}|SHVVP|PVS|VVGNG|VVG|SIP|PV3NG-LS|PV3|PV|KG|UTP|FTP)\\s*[- ]?\\s*\\d*(?:[,.]\\d+)?(?:\\s*[xXhH\\u0445\\u0425]\\s*\\d+(?:[,.]\\d+)?)?`,
      "giu"
    ),
    score: 130,
  },
  {
    re: new RegExp(
      `(?:${CYR_CABLE_MARKS}|SHVVP|PVS|VVGNG|VVG|SIP|PV3NG-LS|PV3|PV|KG|UTP|FTP)(?:[- ]?[A-Z\\u0410-\\u042f\\u0406\\u0407\\u0404\\u0490]+)*\\s*\\d+(?:[,.]\\d+)?(?:\\s*[xXhH\\u0445\\u0425]\\s*\\d+(?:[,.]\\d+)?)?`,
      "giu"
    ),
    score: 130,
  },
];

const TECHNICAL_PATTERNS = [
  /^\d+(?:[.,]\d+)?(?:W|WT|V|VAC|VDC|A|K|LM|MM|M|KA|HZ|MAH|AH)$/i,
  /^IP\d+$/i,
  /^\d+[PX]$/i,
  /^[ABC]-?\d{1,3}A?$/i,
  /^[EG]\d{2}$/i,
  /^\d+[XH]\d+(?:[.,]\d+)?$/i,
  /^\d+(?:[.,]\d+)?[XH]\d+(?:[.,]\d+)?$/i,
  /^(LED|USB|UPS|AC|DC|NO|NC|GOST|DIN|ON|OFF|RESI9)$/i,
  /^(?:GOST|\u0413\u041e\u0421\u0422)\s*\d+$/i,
];

export function isInternalSiteArticle(value) {
  return /^\d{2,8}$/.test(String(value ?? "").trim());
}

export function extractBrandCode({ title = "", url = "", brand = "", siteArticle = "" } = {}) {
  const cleanTitle = cleanText(title);
  const titleCandidates = collectCandidates(cleanTitle, "title", brand, siteArticle);
  const urlCandidates = collectCandidates(urlToSearchText(url), "url", brand, siteArticle);
  const candidates = [...titleCandidates, ...urlCandidates];

  if (candidates.length === 0) return "";

  candidates.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.index !== b.index) return b.index - a.index;
    if (a.code.length !== b.code.length) return b.code.length - a.code.length;
    return b.index - a.index;
  });

  return candidates[0].code;
}

export function resolveDisplayArticle({ article = "", sku = "", brandCode = "", title = "", url = "", brand = "", siteArticle = "" } = {}) {
  const extracted = extractBrandCode({ title, url, brand, siteArticle });

  for (const value of [article, sku]) {
    const code = normalizeCode(value);
    if (code && !isInternalSiteArticle(code) && !isNoArticleLabel(code)) {
      if (isWeakCableCode(code) && extracted) return extracted;
      return code;
    }
  }

  const trustedBrandCode = normalizeCode(brandCode);
  if (trustedBrandCode && !isNoArticleLabel(trustedBrandCode)) {
    if (isWeakCableCode(trustedBrandCode) && extracted) return extracted;
    return trustedBrandCode;
  }

  return extracted;
}

function collectCandidates(text, source, brand, siteArticle) {
  const sourceText = cleanText(text);
  if (!sourceText) return [];

  const normalizedSiteArticle = normalizeCode(siteArticle);
  const normalizedBrand = normalizeCode(brand);
  const brandIndex = brand
    ? sourceText.toLocaleLowerCase("ru").lastIndexOf(String(brand).toLocaleLowerCase("ru"))
    : -1;
  const candidates = [];

  for (const { re, score } of CODE_PATTERNS) {
    re.lastIndex = 0;
    for (const match of sourceText.matchAll(re)) {
      const raw = match[0];
      let code = normalizeCode(raw);
      if (normalizedBrand && code.startsWith(`${normalizedBrand} `)) {
        code = normalizeCode(code.slice(normalizedBrand.length));
      }
      if (!code || code === normalizedSiteArticle || isBadCandidate(code)) continue;

      const index = match.index ?? 0;
      candidates.push({
        code,
        index,
        score:
          score +
          (source === "title" ? 8 : 0) +
          (brandIndex >= 0 && index > brandIndex ? 12 : 0) +
          Math.min(index / 1000, 5),
      });
    }
  }

  if (source === "title" && brandIndex >= 0) {
    const tail = sourceText.slice(brandIndex + String(brand).length);
    for (const match of tail.matchAll(/\b[A-Z]{1,6}\s+\d{1,6}[A-Z0-9/-]*(?:-[A-Z0-9]+)?\b/gi)) {
      const code = normalizeCode(match[0]);
      if (!code || code === normalizedSiteArticle || isNoArticleLabel(code) || isInternalSiteArticle(code)) {
        continue;
      }
      const index = brandIndex + String(brand).length + (match.index ?? 0);
      candidates.push({
        code,
        index,
        score: 124 + Math.min(index / 1000, 5),
      });
    }
    for (const match of tail.matchAll(/\b[A-Z]{1,6}\d{1,8}[A-Z0-9/-]*\b/gi)) {
      const code = normalizeCode(match[0]);
      if (!code || code === normalizedSiteArticle || isNoArticleLabel(code) || isInternalSiteArticle(code)) {
        continue;
      }
      const index = brandIndex + String(brand).length + (match.index ?? 0);
      candidates.push({
        code,
        index,
        score: 112 + Math.min(index / 1000, 5),
      });
    }
    for (const match of tail.matchAll(/\b\d{1,4}(?:[-/]\d{1,4}){1,3}\b/g)) {
      const code = normalizeCode(match[0]);
      if (!code || code === normalizedSiteArticle || isNoArticleLabel(code) || isInternalSiteArticle(code)) {
        continue;
      }
      const index = brandIndex + String(brand).length + (match.index ?? 0);
      candidates.push({
        code,
        index,
        score: 108 + Math.min(index / 1000, 5),
      });
    }
    for (const match of tail.matchAll(/\b\d{3,8}(?:\s*\/\s*\d{3,8})?\b/g)) {
      const code = normalizeCode(match[0]);
      if (!code || code === normalizedSiteArticle || isBadPureBrandCode(code)) {
        continue;
      }
      const index = brandIndex + String(brand).length + (match.index ?? 0);
      candidates.push({
        code,
        index,
        score: 82 + Math.min(index / 1000, 5),
      });
    }
  }

  return dedupeCandidates(candidates);
}

function normalizeCode(value) {
  return String(value ?? "")
    .replace(/[\"'«»]/g, " ")
    .replace(/\s*([./-])\s*/g, "$1")
    .replace(/\s*([()])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleUpperCase("ru");
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/[\u041c\u043c]G/g, "MG")
    .replace(/[\u0410\u0430][\u041c\u043c]/g, "AM")
    .replace(/A[\u041c\u043c]/g, "AM")
    .replace(/[\u0412\u0432][\u041c\u043c]/g, "VM")
    .replace(/\u0422\u0425\u0410/g, "TXA")
    .replace(/\u0422\u041a/g, "TK")
    .replace(/[\"'«»]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function urlToSearchText(url) {
  try {
    const parsed = new URL(url);
    return decodeURIComponent(parsed.pathname)
      .split("/")
      .filter(Boolean)
      .pop()
      ?.replace(/[-_]+/g, " ") ?? "";
  } catch {
    return String(url ?? "").replace(/[-_]+/g, " ");
  }
}

function isBadCandidate(code) {
  if (!code || code.length < 2) return true;
  if (isInternalSiteArticle(code)) return true;
  if (!/\d/.test(code)) return true;
  return TECHNICAL_PATTERNS.some((pattern) => pattern.test(code));
}

function isBadPureBrandCode(code) {
  if (!code || code.length < 3) return true;
  if (TECHNICAL_PATTERNS.some((pattern) => pattern.test(code))) return true;
  return false;
}

function isNoArticleLabel(code) {
  return code === "\u0411\u0415\u0417 \u0410\u0420\u0422\u0418\u041a\u0423\u041b\u0410" || code === "NO CODE" || code === "NO-CODE";
}

function isWeakCableCode(code) {
  return /^(?:SHVVP|PVS|VVGNG|VVG|SIP|PV3NG-LS|PV3|PV|KG|UTP|FTP|[\u0428\u0412\u041f\u0421\u0418\u041a\u0413]{2,6}\d*)$/iu.test(code);
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.code)) return false;
    seen.add(candidate.code);
    return true;
  });
}
