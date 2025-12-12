// packages/shared-types/src/carrier.ts

export type CarrierCode = 'CJ' | 'LOTTE' | 'HANJIN' | string;

export interface Carrier {
  id: string;
  name: string;
  code: CarrierCode;
  phone?: string;
  homepage?: string;
}

export interface TrackingEvent {
  time: string;          // ISO8601
  status: string;        // e.g., "in_transit", "delivered"
  description?: string;
  location?: string;
}

export interface TrackingInfo {
  carrierCode: CarrierCode;
  trackingNumber: string;
  events: TrackingEvent[];
}
