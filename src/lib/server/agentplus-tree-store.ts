import { existsSync } from "fs";
import { readFile, stat } from "fs/promises";
import { join } from "path";
import type {
  AgentPlusTreeFile,
  AgentPlusTreeNode,
  AgentPlusTreeProduct,
  AgentPlusTreeProductsFile,
} from "@/lib/agentplus-tree";

const TREE_FILE = join(process.cwd(), "data", "agentplus-tree.json");
const PRODUCTS_FILE = join(process.cwd(), "data", "agentplus-tree-products.json");

interface CachedTree {
  signature: string;
  file: AgentPlusTreeFile;
  nodeById: Map<string, AgentPlusTreeNode>;
  descendantIdsByNode: Map<string, string[]>;
}

interface CachedProducts {
  signature: string;
  productsByGroup: Record<string, AgentPlusTreeProduct[]>;
}

let cached: CachedTree | null = null;
let cachedProducts: CachedProducts | null = null;

export async function readAgentPlusTree() {
  const cache = await getTreeCache();
  return cache.file;
}

export async function getAgentPlusTreeNode(id: string) {
  const cache = await getTreeCache();
  return cache.nodeById.get(id) ?? null;
}

export async function getAgentPlusTreeProducts(
  groupId: string,
  options: { offset?: number; limit?: number } = {}
): Promise<AgentPlusTreeProduct[]> {
  const cache = await getTreeCache();
  const productsByGroup = await getProductsByGroup();
  const groupIds = cache.descendantIdsByNode.get(groupId) ?? [groupId];
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const limit =
    typeof options.limit === "number" && Number.isFinite(options.limit)
      ? Math.max(1, Math.floor(options.limit))
      : undefined;
  const seen = new Set<string>();
  const products: AgentPlusTreeProduct[] = [];
  let skipped = 0;

  for (const id of groupIds) {
    for (const input of productsByGroup[id] ?? []) {
      const product = normalizeProduct(input);
      if (!product) continue;

      const key = product.agentGuid || `${product.groupId}:${product.name}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (skipped < offset) {
        skipped += 1;
        continue;
      }

      products.push(product);
      if (limit && products.length >= limit) return products;
    }
  }

  return products;
}

async function getTreeCache(): Promise<CachedTree> {
  const signature = await getSignature();
  if (cached?.signature === signature) return cached;

  const file = await readTreeFile();
  const nodeById = new Map<string, AgentPlusTreeNode>();
  const descendantIdsByNode = new Map<string, string[]>();

  const indexNode = (node: AgentPlusTreeNode): string[] => {
    nodeById.set(node.id, node);
    const ids = [node.id];
    for (const child of node.children ?? []) {
      ids.push(...indexNode(child));
    }
    descendantIdsByNode.set(node.id, ids);
    return ids;
  };
  for (const root of file.roots) {
    indexNode(root);
  }

  cached = { signature, file, nodeById, descendantIdsByNode };
  return cached;
}

async function readTreeFile(): Promise<AgentPlusTreeFile> {
  try {
    const raw = await readFile(TREE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<AgentPlusTreeFile>;
    return {
      version: Number(parsed.version) || 1,
      generatedAt: String(parsed.generatedAt ?? ""),
      source: String(parsed.source ?? ""),
      totalGroups: Number(parsed.totalGroups) || 0,
      totalProducts: Number(parsed.totalProducts) || 0,
      matchedProducts: Number(parsed.matchedProducts) || 0,
      roots: Array.isArray(parsed.roots) ? parsed.roots : [],
      productsByGroup:
        parsed.productsByGroup && typeof parsed.productsByGroup === "object"
          ? parsed.productsByGroup
          : undefined,
    };
  } catch {
    return {
      version: 1,
      generatedAt: "",
      source: "",
      totalGroups: 0,
      totalProducts: 0,
      matchedProducts: 0,
      roots: [],
    };
  }
}

async function getProductsByGroup() {
  const signature = await getProductsSignature();
  if (cachedProducts?.signature === signature) {
    return cachedProducts.productsByGroup;
  }

  const productsByGroup = await readProductsByGroup();
  cachedProducts = { signature, productsByGroup };
  return productsByGroup;
}

async function readProductsByGroup(): Promise<Record<string, AgentPlusTreeProduct[]>> {
  if (existsSync(PRODUCTS_FILE)) {
    try {
      const raw = await readFile(PRODUCTS_FILE, "utf-8");
      const parsed = JSON.parse(raw) as Partial<AgentPlusTreeProductsFile>;
      return parsed.productsByGroup && typeof parsed.productsByGroup === "object"
        ? parsed.productsByGroup
        : {};
    } catch {
      return {};
    }
  }

  const tree = await readTreeFile();
  return tree.productsByGroup && typeof tree.productsByGroup === "object"
    ? tree.productsByGroup
    : {};
}

async function getSignature() {
  return getFileSignature(TREE_FILE, "agentplus-tree:none");
}

async function getProductsSignature() {
  return getFileSignature(PRODUCTS_FILE, "agentplus-tree-products:none");
}

async function getFileSignature(path: string, fallback: string) {
  if (!existsSync(path)) return fallback;
  const info = await stat(path);
  return `${path}:${info.mtimeMs}:${info.size}`;
}

function normalizeProduct(input: AgentPlusTreeProduct): AgentPlusTreeProduct | null {
  if (!input?.agentGuid || !input.name) return null;
  const stock =
    typeof input.stock === "number" && Number.isFinite(input.stock)
      ? input.stock
      : undefined;
  const price =
    typeof input.price === "number" && Number.isFinite(input.price)
      ? input.price
      : undefined;

  return {
    agentGuid: String(input.agentGuid),
    name: String(input.name),
    groupId: String(input.groupId ?? ""),
    price,
    stock,
    imageUrl: input.imageUrl ? String(input.imageUrl) : undefined,
    imageSource: input.imageSource ? String(input.imageSource) : undefined,
    unit: input.unit ? String(input.unit) : "шт",
    categoryPath: Array.isArray(input.categoryPath)
      ? input.categoryPath.map(String).filter(Boolean)
      : [],
    pwaProductId: input.pwaProductId ? String(input.pwaProductId) : undefined,
    pwaSku: input.pwaSku ? String(input.pwaSku) : undefined,
    pwaName: input.pwaName ? String(input.pwaName) : undefined,
    matchedBy: input.matchedBy ? String(input.matchedBy) : undefined,
  };
}
