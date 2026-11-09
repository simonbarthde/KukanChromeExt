export type PortalType = 'immoscout24' | 'immowelt' | 'kleinanzeigen' | 'other';

export interface ExtractedDealPayload {
  portal: PortalType;
  external_id?: string;
  source_url: string;
  title: string;
  address?: {
    street?: string;
    house_number?: string;
    zip?: string;
    city?: string;
    full_address?: string;
  };
  financials?: {
    purchase_price_eur?: number;
    purchase_price_cents?: number;
    price_per_sqm_eur?: number;
    broker_commission_pct?: number;
    broker_commission_eur?: number;
    monthly_house_money_eur?: number;
  };
  specs?: {
    living_area_sqm?: number;
    usable_area_sqm?: number;
    plot_area_sqm?: number;
    rooms?: number;
    bedrooms?: number;
    bathrooms?: number;
    construction_year?: number;
    last_renovation_year?: number;
    condition?: string;
    heating_type?: string;
    energy_class?: string;
    energy_val_kwh?: number;
    rented?: boolean;
    current_net_rent_eur?: number;
  };
  contact?: {
    broker_company?: string;
    broker_name?: string;
    broker_phone?: string;
    broker_email?: string;
  };
  media?: {
    cover_image_url?: string;
    image_urls?: string[];
  };
  description?: string;
  extracted_at: string;
}

export interface StagingIngestRequest {
  company_id?: string;
  source_channel: 'portal_link';
  source_portal: PortalType;
  source_url: string;
  extracted_payload: ExtractedDealPayload;
  field_confidences?: Record<string, number>;
}

export interface FlipOSConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  companyId?: string;
  authToken?: string;
  userEmail?: string;
}
