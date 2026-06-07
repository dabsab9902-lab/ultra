export interface AgentPlusOfflineClient {
  id: string;
  name: string;
  legalName?: string;
  phone?: string;
  phones: string[];
  group?: string;
  groupPath: string[];
  contract?: string;
  contracts: string[];
  debt?: number;
  debtDate?: string;
}

export interface AgentPlusOfflineClientsFile {
  version: number;
  generatedAt: string;
  source: string;
  total: number;
  clients: AgentPlusOfflineClient[];
}
