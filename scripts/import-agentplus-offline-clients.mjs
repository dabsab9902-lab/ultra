import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";

const DEFAULT_XML_PATH = join(
  process.env.TEMP || process.cwd(),
  "ultra-svet-1c-audit",
  "FromCDB.xml"
);
const OUTPUT_PATH = join(process.cwd(), "data", "agentplus-offline-clients.json");

const GUIDS = {
  clients: "9450980F-FB59-47E3-BAE2-AA3C58441B1A",
  contracts: "735A9CE5-DCC1-4D1A-8F8D-643A50A6BEFC",
  contactTypes: "564E0ECA-C498-4D28-83D7-4BDEAEC558E2",
  contacts: "85B62882-0156-4881-85BA-B8FEF05C867B",
  debt: "A93AADFA-2A35-40FE-B88A-3768825CDD31",
};

const inputPath = resolve(process.argv[2] || DEFAULT_XML_PATH);

if (!existsSync(inputPath)) {
  console.error(`FromCDB.xml not found: ${inputPath}`);
  console.error(
    "Pass XML path: npm run import:agentplus-clients -- C:\\path\\FromCDB.xml"
  );
  process.exit(1);
}

const xml = readFileSync(inputPath, "utf-8");
const clientsBlock = blockBy("CATALOG", GUIDS.clients);
const groupsBlock = clientsBlock.match(/<GROUPS>[\s\S]*?<\/GROUPS>/)?.[0] ?? "";
const clientGroups = itemsIn(groupsBlock);
const clientElements = firstElementItems(
  clientsBlock.slice((clientsBlock.match(/<\/GROUPS>/)?.index ?? -9) + 9)
);
const contracts = firstElementItems(blockBy("CATALOG", GUIDS.contracts));
const contactTypes = firstElementItems(blockBy("CATALOG", GUIDS.contactTypes));
const contacts = firstElementItems(blockBy("CATALOG", GUIDS.contacts));
const debts = firstElementItems(blockBy("DOCUMENT", GUIDS.debt));

const groupById = new Map(clientGroups.map((group) => [group.GUID, group]));
const groupPathMemo = new Map();
const contractsByClient = groupBy(contracts, "A02");
const contactTypesById = new Map(contactTypes.map((type) => [type.GUID, type]));
const phoneTypeIds = new Set(
  contactTypes
    .filter((type) => /телефон/i.test(type.Name ?? ""))
    .map((type) => type.GUID)
);
const contactsByClient = groupBy(contacts, "A01");
const debtByClient = new Map();

for (const debt of debts) {
  const clientId = debt.A03;
  if (!clientId) continue;
  const value = parseMoney(debt.A07);
  const current = debtByClient.get(clientId) ?? { debt: 0, debtDate: "" };
  debtByClient.set(clientId, {
    debt: current.debt + value,
    debtDate: debt.A06 || debt.dt || current.debtDate,
  });
}

const offlineClients = clientElements
  .map((client) => {
    const groupPath = getGroupPath(client.GrpId0, groupById, groupPathMemo);
    const clientContracts = unique(
      (contractsByClient.get(client.GUID) ?? [])
        .map((contract) => contract.Name)
        .filter(Boolean)
    );
    const phoneContacts = (contactsByClient.get(client.GUID) ?? []).filter(
      (contact) =>
        phoneTypeIds.has(contact.A05) ||
        /телефон/i.test(contactTypesById.get(contact.A05)?.Name ?? "")
    );
    const phones = unique(
      phoneContacts.flatMap((contact) => extractPhones(contact.A06 ?? ""))
    );
    const debtInfo = debtByClient.get(client.GUID);
    const fallbackDebt = parseMoney(client.A015);
    const debt =
      debtInfo?.debt && debtInfo.debt > 0
        ? roundMoney(debtInfo.debt)
        : fallbackDebt > 0
          ? roundMoney(fallbackDebt)
          : undefined;

    return {
      id: client.GUID,
      name: client.Name,
      legalName: client.A012 || undefined,
      phone: phones[0],
      phones,
      group: groupPath.at(-1),
      groupPath,
      contract: clientContracts[0],
      contracts: clientContracts,
      debt,
      debtDate: debtInfo?.debtDate,
    };
  })
  .filter((client) => client.id && client.name)
  .sort((a, b) => a.name.localeCompare(b.name, "uk"));

const payload = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: inputPath,
  total: offlineClients.length,
  clients: offlineClients,
};

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");

const withPhone = offlineClients.filter((client) => client.phone).length;
const withDebt = offlineClients.filter((client) => client.debt).length;

console.log(`AgentPlus offline clients imported: ${offlineClients.length}`);
console.log(`With phone: ${withPhone}`);
console.log(`With debt: ${withDebt}`);
console.log(`Output: ${OUTPUT_PATH}`);

function blockBy(tag, guid) {
  const startRe = new RegExp(`<${tag}\\b[^>]*GUID="${guid}"[^>]*>`, "i");
  const match = startRe.exec(xml);
  if (!match) return "";
  if (/\/\s*>$/.test(match[0])) return "";
  const start = match.index + match[0].length;
  const close = `</${tag}>`;
  const end = xml.indexOf(close, start);
  return end >= 0 ? xml.slice(start, end) : "";
}

function firstElementItems(block) {
  const match = block.match(/<ELEMENTS\b[^>]*>([\s\S]*?)<\/ELEMENTS>/);
  return match ? itemsIn(match[1]) : [];
}

function itemsIn(block) {
  return Array.from(block.matchAll(/<ITEM\b([^>]*)\/>/g)).map((match) =>
    attrs(match[1])
  );
}

function attrs(value) {
  const result = {};
  for (const match of value.matchAll(/([A-Za-z0-9_]+)="([^"]*)"/g)) {
    result[match[1]] = decodeXml(match[2]);
  }
  return result;
}

function decodeXml(value) {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function groupBy(items, key) {
  const map = new Map();
  for (const item of items) {
    const value = item[key];
    if (!value) continue;
    const list = map.get(value) ?? [];
    list.push(item);
    map.set(value, list);
  }
  return map;
}

function getGroupPath(groupId, groups, memo) {
  if (!groupId || !groups.has(groupId)) return [];
  if (memo.has(groupId)) return memo.get(groupId);
  const group = groups.get(groupId);
  const path = [...getGroupPath(group.ParId, groups, memo), cleanGroupName(group.Name)];
  memo.set(groupId, path);
  return path;
}

function cleanGroupName(value) {
  return String(value ?? "")
    .replace(/^\s*\d+\s*[_-]\s*/u, "")
    .trim();
}

function extractPhones(value) {
  const text = String(value ?? "");
  return unique(
    Array.from(text.matchAll(/(?:\+?38)?0\d{2}[\s().-]?\d{3}[\s().-]?\d{2}[\s().-]?\d{2}/g))
      .map((match) => normalizePhone(match[0]))
      .filter(Boolean)
  );
}

function normalizePhone(value) {
  const digits = String(value).replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) return `+38${digits}`;
  if (digits.length === 12 && digits.startsWith("380")) return `+${digits}`;
  return digits.length >= 7 ? digits : "";
}

function parseMoney(value) {
  const number = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(number) ? number : 0;
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}
