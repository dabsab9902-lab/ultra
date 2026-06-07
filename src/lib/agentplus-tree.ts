import type { Product } from "@/lib/types";

export interface AgentPlusTreeNode {
  id: string;
  name: string;
  parentId?: string;
  path: string[];
  level: number;
  count: number;
  directCount: number;
  matchedCount: number;
  directMatchedCount: number;
  children: AgentPlusTreeNode[];
}

export interface AgentPlusTreeProduct {
  agentGuid: string;
  name: string;
  groupId: string;
  price?: number;
  stock?: number;
  unit: string;
  imageUrl?: string;
  imageSource?: string;
  categoryPath: string[];
  pwaProductId?: string;
  pwaSku?: string;
  pwaName?: string;
  matchedBy?: string;
}

export interface AgentPlusTreeFile {
  version: number;
  generatedAt: string;
  source: string;
  totalGroups: number;
  sourceGroups?: number;
  totalProducts: number;
  matchedProducts: number;
  roots: AgentPlusTreeNode[];
  productsByGroup?: Record<string, AgentPlusTreeProduct[]>;
}

export interface AgentPlusTreeProductsFile {
  version: number;
  generatedAt: string;
  source: string;
  totalProducts: number;
  matchedProducts: number;
  productsByGroup: Record<string, AgentPlusTreeProduct[]>;
}

export interface AgentPlusTreeProductRow {
  agent: AgentPlusTreeProduct;
  product: Product | null;
}
