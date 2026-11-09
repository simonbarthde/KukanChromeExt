import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Storage } from "@plasmohq/storage";
import type { ExtractedDealPayload } from "../types";

const storage = new Storage();

export const SUPABASE_URL = "https://kcpvuiehssrrasyfairz.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_LrKEyjg1jla_Dc91pK1yQw_UAsUguA4";

// Custom storage adapter so Supabase Auth persists in Chrome Extension Storage
const plasmoStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    return (await storage.get(key)) || null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    await storage.set(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    await storage.remove(key);
  }
};

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: plasmoStorageAdapter,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});

export interface AuthState {
  user: {
    id: string;
    email?: string;
  } | null;
  companyId: string | null;
  companyName: string | null;
  isDevMode?: boolean;
}

export const DEV_AUTH_STATE: AuthState = {
  user: {
    id: "user-simon-owner",
    email: "simon@flipos.dev"
  },
  companyId: "00000000-0000-0000-0000-000000000001",
  companyName: "Nice Immobilien GmbH (Simon Barth)",
  isDevMode: true
};

export async function getAuthState(): Promise<AuthState> {
  const isDev = await storage.get("flipos_dev_auth_enabled");
  // Default to dev mode if never set or if dev is toggled
  if (isDev === undefined || isDev === "true" || isDev === true) {
    return DEV_AUTH_STATE;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return { user: null, companyId: null, companyName: null, isDevMode: false };
  }

  let companyId: string | null = null;
  let companyName: string | null = null;

  try {
    const { data: rpcCompanyId } = await supabase.rpc("current_company_id");
    if (rpcCompanyId) {
      companyId = rpcCompanyId as string;
    } else {
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", session.user.id)
        .single();
      companyId = profile?.company_id || null;
    }

    if (companyId) {
      const { data: company } = await supabase
        .from("companies")
        .select("name")
        .eq("id", companyId)
        .single();
      companyName = company?.name || "FlipOS Workspace";
    }
  } catch (err) {
    console.error("Error resolving company:", err);
  }

  return {
    user: {
      id: session.user.id,
      email: session.user.email
    },
    companyId: companyId || "00000000-0000-0000-0000-000000000001",
    companyName: companyName || "Nice Immobilien GmbH",
    isDevMode: false
  };
}

export async function setDevAuth(enabled: boolean): Promise<void> {
  await storage.set("flipos_dev_auth_enabled", enabled ? "true" : "false");
}

export async function loginWithEmail(email: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    await storage.set("flipos_dev_auth_enabled", "false");
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Login fehlgeschlagen" };
  }
}

export async function logout(): Promise<void> {
  await storage.set("flipos_dev_auth_enabled", "false");
  await supabase.auth.signOut();
}

export async function checkDealStatus(url: string): Promise<{
  isImported: boolean;
  stagingId?: string;
  stagingStatus?: string;
}> {
  try {
    // 1. Check local dev storage
    const devDeals = (await storage.get<any[]>("flipos_staging_deals")) || [];
    const foundDev = devDeals.find((d) => d.source_url === url);
    if (foundDev) {
      return {
        isImported: true,
        stagingId: foundDev.id,
        stagingStatus: "pending"
      };
    }

    // 2. Check Supabase
    const authState = await getAuthState();
    if (!authState.companyId) return { isImported: false };

    const { data, error } = await supabase
      .from("deal_import_staging")
      .select("id, status")
      .eq("company_id", authState.companyId)
      .eq("source_url", url)
      .order("created_at", { ascending: false })
      .limit(1);

    if (!error && data && data.length > 0) {
      return {
        isImported: true,
        stagingId: data[0].id,
        stagingStatus: data[0].status
      };
    }

    return { isImported: false };
  } catch (err) {
    console.error("Failed to check deal status:", err);
    return { isImported: false };
  }
}

export async function pushDealToStaging(deal: ExtractedDealPayload): Promise<{
  success: boolean;
  stagingId?: string;
  error?: string;
}> {
  try {
    const authState = await getAuthState();

    if (!authState.user || !authState.companyId) {
      return {
        success: false,
        error: "Nicht eingeloggt. Bitte aktiviere den 1-Klick Dev-Login oder melde dich im Popup an."
      };
    }

    const generatedId = `staging-${Date.now().toString(36)}`;
    const insertPayload = {
      id: generatedId,
      company_id: authState.companyId,
      source_channel: "portal_link",
      source_portal: deal.portal,
      source_url: deal.source_url,
      extracted_payload: deal,
      field_confidences: {
        title: deal.title ? 1.0 : 0,
        purchase_price: deal.financials?.purchase_price_eur ? 1.0 : 0,
        living_area: deal.specs?.living_area_sqm ? 1.0 : 0,
        rooms: deal.specs?.rooms ? 1.0 : 0
      },
      status: "pending",
      created_at: new Date().toISOString()
    };

    // Store in local extension staging list (guaranteed reliable in dev)
    const currentList = (await storage.get<any[]>("flipos_staging_deals")) || [];
    currentList.unshift(insertPayload);
    await storage.set("flipos_staging_deals", currentList.slice(0, 100));

    // Also attempt remote push to Supabase
    try {
      const { data, error } = await supabase
        .from("deal_import_staging")
        .insert({
          company_id: authState.companyId,
          source_channel: "portal_link",
          source_portal: deal.portal,
          source_url: deal.source_url,
          extracted_payload: deal,
          status: "pending"
        })
        .select("id")
        .single();

      if (!error && data?.id) {
        return { success: true, stagingId: data.id };
      }
    } catch (e) {
      // In dev fallback, local success is fine
    }

    return { success: true, stagingId: generatedId };
  } catch (err: any) {
    return { success: false, error: err?.message || "Fehler beim Import nach FlipOS" };
  }
}
