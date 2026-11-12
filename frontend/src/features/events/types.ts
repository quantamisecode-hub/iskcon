/**
 * Shared Phase 4 types (events, calendar, dishes, materials).
 * Mirrors the backend DTOs - quantities as numbers, dates as YYYY-MM-DD.
 */

export type EventStatus = 'DRAFT' | 'PLANNING' | 'READY' | 'COMPLETED' | 'CANCELLED';

export interface UserRef {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface FoodItemRef {
  id: string;
  name: string;
  minimumStock: number;
  reorderLevel: number;
  isActive: boolean;
  unit: { id?: string; symbol: string; name: string };
  currentStock: number;
}

export interface UnitRef {
  id: string;
  symbol: string;
  name: string;
}

export interface EventMaterialLine {
  id: string;
  plannedQuantity: number;
  notes: string | null;
  /** Draft lines are shortfall items parked for later; an ADMIN commits them once stocked in. */
  isDraft: boolean;
  unit: UnitRef;
  foodItem: FoodItemRef;
}

export interface EventDishItem {
  id: string;
  dishId: string;
  displayOrder: number;
  notes: string | null;
  dish: {
    id: string;
    name: string;
    description: string | null;
    isActive: boolean;
  };
  materials: EventMaterialLine[];
}

export interface EventDetail {
  id: string;
  eventCode: string;
  name: string;
  description: string | null;
  eventDate: string;
  startTime: string;
  endTime: string | null;
  numberOfPeople: number;
  location: string | null;
  notes: string | null;
  status: EventStatus;
  adminId: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
  admin: UserRef;
  creator: UserRef;
  /** Phase 7 extension: populated once the event is cancelled (ADMIN only). */
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  cancelledBy?: UserRef | null;
  dishes: EventDishItem[];
  summary: { totalDishes: number; totalMaterialLines: number };
}

export interface EventListItem {
  id: string;
  eventCode: string;
  name: string;
  eventDate: string;
  startTime: string;
  endTime: string | null;
  numberOfPeople: number;
  location: string | null;
  status: EventStatus;
  createdAt: string;
  admin: UserRef;
  creator: UserRef;
  dishCount: number;
  materialLineCount: number;
}

export interface EventsPage {
  events: EventListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CalendarEvent {
  id: string;
  eventCode: string;
  name: string;
  date: string;
  startTime: string;
  endTime: string | null;
  numberOfPeople: number;
  status: EventStatus;
  location: string | null;
  dishCount: number;
}

export interface DishItem {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  materialsCount?: number;
  eventsCount?: number;
  materials?: DishMaterialLine[];
}

export interface DishMaterialLine {
  id: string;
  quantityPerPerson: number | null;
  unit: UnitRef;
  foodItem: FoodItemRef;
}

export interface DishesPage {
  dishes: DishItem[];
  total: number;
  page: number;
  pageSize: number;
}
