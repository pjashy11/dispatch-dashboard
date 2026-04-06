/** A load as displayed in the load list table. */
export interface Load {
  id: number;
  bolNumber: string;
  confirmationNo: string;
  status: string;
  pickupAccountName: string;
  pickupName: string;
  pickupOperator: string;
  tankName: string;
  dropoffAccountName: string;
  dropoffName: string;
  terminal: string;
  loadedMiles: number | null;
  requestedPickupDate: string;
  assignedPickupDate: string;
  driverName: string;
  commodity: string;
  isUrgent: boolean;
  loadInstructions: string;
  aging: number;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
}

/** A dispatch load with driver info. */
export interface DispatchLoad extends Load {
  pickupArrivalDate: string;
  /** 0–100 progress based on milestones (pickup arrival → departure → dropoff arrival → complete) */
  progress: number;
  /** When the dispatcher assigned this load (ISO-sortable string "YYYY/MM/DD HH:MM") */
  dispatchedAt: string;
  driverId: number | null;
  driverHostId: string;
  driverPhone: string;
  driverCarrier: string;
  sequenceNumber: number | null;
  shiftDate: string;
}

/** Data for the load creation form. */
export interface LoadFormData {
  terminalId: number | null;
  terminalHostId: string;
  terminalName: string;
  scenarioId: number | null;
  pickupAccountId: number | null;
  pickupAccountHostId: string;
  pickupAccountName: string;
  pickupId: number | null;
  pickupHostId: string;
  pickupName: string;
  pickupNumber: string;
  dropoffAccountId: number | null;
  dropoffAccountHostId: string;
  dropoffAccountName: string;
  dropoffId: number | null;
  dropoffHostId: string;
  dropoffName: string;
  dropoffNumber: string;
  tankId: number | null;
  tankHostId: string;
  tankNumber: string;
  loadedMiles: string;
  averageSpeed: string;
  isUrgent: boolean;
  requestedPickupDate: string;
  requestedPickupTime: string;
  requestedDropoffDate: string;
  requestedDropoffTime: string;
  confirmationNo: string;
}

/** Entity result from setupinfo. */
export interface Entity {
  id: number;
  hostId: string;
  name?: string;
  fullName?: string;
  number?: string;
  [key: string]: unknown;
}

/** Terminal from setupinfo. */
export interface Terminal {
  id: number;
  hostId: string;
  name: string;
}

/** Scenario from setupinfo. */
export interface Scenario {
  scenarioId: number;
  hostId: string;
  isActive: boolean;
  loadedMiles: number;
  averageSpeed: number;
  pickUpId: number;
  pickUpName: string;
  pickUpHostId: string;
  pickUpAccountId: number;
  pickUpAccountName: string;
  pickUpAccountHostId: string;
  dropOffId: number;
  dropOffName: string;
  dropOffHostId: string;
  dropOffAccountId: number;
  dropOffAccountName: string;
  dropOffAccountHostId: string;
}
