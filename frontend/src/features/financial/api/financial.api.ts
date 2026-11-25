import { API_ENDPOINTS, eventExpensesPath, financialEventPath } from '../../../constants/apiEndpoints';
import { apiClient } from '../../../services/api/apiClient';
import type { ApiSuccess } from '../../../types/api';

/**
 * ADMIN-only financial data. Every number comes from the server; the browser
 * never submits or computes a cost, valuation, surplus or P&L figure.
 */

export type StockTypeValue = 'CHARITY' | 'EXPENSE' | null;
export type StockFilter = 'ALL' | 'CHARITY' | 'EXPENSE' | 'UNCLASSIFIED';
export type ResultFilter = 'ALL' | 'SURPLUS' | 'DEFICIT' | 'BREAK_EVEN';
export type ExpenseCategory = 'GAS' | 'TRANSPORT' | 'LABOUR' | 'OTHER';

export interface EventFinancialStatement {
  event: {
    id: string; eventCode: string; name: string; eventDate: string;
    status: string; numberOfPeople: number; location: string | null;
    donationType: string | null; donationGivenBy: string | null; trNumber: string | null;
  };
  revenue: { cashDonations: number; donationType: string | null; donationGivenBy: string | null; trNumber: string | null };
  inventory: {
    charityValue: number; expenseValue: number; unclassifiedValue: number; totalValue: number;
    charityQuantity: number; expenseQuantity: number; unclassifiedQuantity: number;
  };
  byItem: Array<{
    foodItemId: string; name: string; unit: string;
    stockType: StockTypeValue; quantity: number; value: number;
  }>;
  fifoDetail: Array<{
    allocationId: string; stockLotId: string; lotNumber: string;
    vendorId: string | null; vendorName: string | null; receivedDate: string;
    stockType: StockTypeValue; quantity: number; unitCost: number | null; value: number;
  }>;
  otherExpenses: Array<{
    id: string; category: string; description: string; amount: number;
    expenseDate: string; reference: string | null; notes: string | null;
  }>;
  totals: {
    otherExpenses: number; inventoryUtilization: number; resourceUtilization: number;
    cashEventCost: number; cashResult: number; costPerPerson: number;
    result: 'SURPLUS' | 'DEFICIT' | 'BREAK_EVEN';
  };
}

export interface LedgerEventRow {
  id: string; eventCode: string; name: string; eventDate: string; eventType: string | null; location: string | null;
  status: string; donations: number; charityStock: number; expenseStock: number;
  unclassifiedStock: number; otherExpenses: number; inventoryUtilization: number;
  resourceUtilization: number; cashEventCost: number; cashResult: number;
  result: 'SURPLUS' | 'DEFICIT' | 'BREAK_EVEN'; stockTypes: string[];
}

export interface FinancialLedger {
  overview: {
    events: number; cashDonations: number; charityStockUtilized: number;
    expenseStockConsumed: number; unclassifiedStock: number; otherExpenses: number;
    totalResourceUtilization: number; cashEventCost: number; cashResult: number;
  };
  events: LedgerEventRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface InventoryTypeSummary {
  items: Array<{
    foodItemId: string; name: string; unit: string;
    charityQuantity: number; expenseQuantity: number; unclassifiedQuantity: number;
    charityValue: number; expenseValue: number; totalValue: number;
  }>;
  totals: { charityValue: number; expenseValue: number; totalValue: number };
}

export interface FinancialFilters {
  dateFrom?: string;
  dateTo?: string;
  eventId?: string;
  eventType?: string;
  location?: string;
  stockType?: StockFilter;
  result?: ResultFilter;
  status?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchFinancialLedger(filters: FinancialFilters = {}): Promise<FinancialLedger> {
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '' && value !== 'ALL') params[key] = value;
  }
  const response = await apiClient.get<ApiSuccess<FinancialLedger>>(`${API_ENDPOINTS.financial}/summary`, { params });
  return response.data.data;
}

export async function fetchEventFinancialStatement(eventId: string): Promise<EventFinancialStatement> {
  const response = await apiClient.get<ApiSuccess<EventFinancialStatement>>(financialEventPath(eventId));
  return response.data.data;
}

export async function fetchInventoryTypeSummary(): Promise<InventoryTypeSummary> {
  const response = await apiClient.get<ApiSuccess<InventoryTypeSummary>>(`${API_ENDPOINTS.financial}/inventory`);
  return response.data.data;
}

export interface EventExpense {
  id: string; eventId: string; category: ExpenseCategory; description: string;
  amount: number; expenseDate: string; reference: string | null; notes: string | null;
  createdBy: string | null; createdAt: string; updatedAt: string;
}

export interface EventExpensePayload {
  eventId: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  expenseDate: string;
  reference?: string | null;
  notes?: string | null;
}

export async function fetchEventExpenses(eventId: string): Promise<EventExpense[]> {
  const response = await apiClient.get<ApiSuccess<{ expenses: EventExpense[]; total: number }>>(eventExpensesPath(), {
    params: { eventId },
  });
  return response.data.data.expenses;
}

export async function createEventExpense(payload: EventExpensePayload): Promise<EventExpense> {
  const response = await apiClient.post<ApiSuccess<EventExpense>>(eventExpensesPath(), payload);
  return response.data.data;
}

export async function updateEventExpense(id: string, payload: Partial<Omit<EventExpensePayload, 'eventId'>>): Promise<EventExpense> {
  const response = await apiClient.patch<ApiSuccess<EventExpense>>(eventExpensesPath(id), payload);
  return response.data.data;
}

export async function deleteEventExpense(id: string): Promise<void> {
  await apiClient.delete(eventExpensesPath(id));
}
