export const ORDER_STATUSES = ["Новый", "В работе", "Выполнен"] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface ManagerOrderCustomer {
  name: string;
  phone: string;
  comment?: string;
}

export interface ManagerOrderItem {
  productId?: string;
  sku: string;
  name: string;
  quantity: number;
  unit: string;
  price: number;
  total: number;
}

export interface ManagerOrder {
  id: string;
  orderId: string;
  date: string;
  clientId?: string;
  clientName?: string;
  clientPhone?: string;
  customer: ManagerOrderCustomer;
  items: ManagerOrderItem[];
  total: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OrdersPayload {
  orders: ManagerOrder[];
}

export function isOrderStatus(value: unknown): value is OrderStatus {
  return (
    typeof value === "string" &&
    ORDER_STATUSES.includes(value as OrderStatus)
  );
}
