export type CarrierCode = 'CJ' | 'LOTTE' | 'HANJIN' | string;
export interface Carrier {
    id: string;
    name: string;
    code: CarrierCode;
    phone?: string;
    homepage?: string;
}
export interface TrackingEvent {
    time: string;
    status: string;
    description?: string;
    location?: string;
}
export interface TrackingInfo {
    carrierCode: CarrierCode;
    trackingNumber: string;
    events: TrackingEvent[];
}
