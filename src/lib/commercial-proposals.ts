import type {
  ManagerOrderCustomer,
  ManagerOrderItem,
} from "@/lib/manager-orders";

export const PROPOSAL_STATUS_NEW = "\u041d\u043e\u0432\u043e\u0435";
export const PROPOSAL_STATUS_VIEWED =
  "\u041f\u0440\u043e\u0441\u043c\u043e\u0442\u0440\u0435\u043d\u043e";
export const PROPOSAL_STATUS_CLIENT_CHANGED =
  "\u0418\u0437\u043c\u0435\u043d\u0435\u043d\u043e \u043a\u043b\u0438\u0435\u043d\u0442\u043e\u043c";
export const PROPOSAL_STATUS_ACCEPTED =
  "\u041f\u0440\u0438\u043d\u044f\u0442\u043e";
export const PROPOSAL_STATUS_REJECTED =
  "\u041e\u0442\u043a\u043b\u043e\u043d\u0435\u043d\u043e";

export const PROPOSAL_STATUSES = [
  PROPOSAL_STATUS_NEW,
  PROPOSAL_STATUS_VIEWED,
  PROPOSAL_STATUS_CLIENT_CHANGED,
  PROPOSAL_STATUS_ACCEPTED,
  PROPOSAL_STATUS_REJECTED,
] as const;

export type CommercialProposalStatus = (typeof PROPOSAL_STATUSES)[number];
export type CommercialProposalActor = "manager" | "client" | "system";

export interface CommercialProposalHistoryEntry {
  id: string;
  date: string;
  actor: CommercialProposalActor;
  action: string;
  status: CommercialProposalStatus;
  items: ManagerOrderItem[];
  total: number;
  managerComment?: string;
  clientComment?: string;
  changes?: string[];
}

export interface CommercialProposal {
  id: string;
  proposalId: string;
  date: string;
  clientId?: string;
  clientName?: string;
  clientPhone?: string;
  customer: ManagerOrderCustomer;
  items: ManagerOrderItem[];
  total: number;
  status: CommercialProposalStatus;
  managerComment?: string;
  clientComment?: string;
  changeSummary?: string[];
  history: CommercialProposalHistoryEntry[];
  acceptedOrderId?: string;
  viewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommercialProposalsPayload {
  version: number;
  proposals: CommercialProposal[];
}

export function isCommercialProposalStatus(
  value: unknown
): value is CommercialProposalStatus {
  return (
    typeof value === "string" &&
    PROPOSAL_STATUSES.includes(value as CommercialProposalStatus)
  );
}

export function isFinalProposalStatus(status: CommercialProposalStatus) {
  return status === PROPOSAL_STATUS_ACCEPTED || status === PROPOSAL_STATUS_REJECTED;
}
