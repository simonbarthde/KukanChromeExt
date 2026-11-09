import { createClient, SupabaseClient, Session } from "@supabase/supabase-js";
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
}

export async function getAuthState(): Promise<AuthState> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return { user: null, companyId: null, companyName: null };
  }

  // Resolve company_id via RPC or profile
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
    companyId,
    companyName
  };
}

export async function loginWithEmail(email: string, password: string):Promise<{ success: boolean; error?: string }> {
  try {
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
  await supabase.auth.signOut();
}

export async function checkDealStatus(url: string): Promise<{
  isImported: boolean;
  stagingId?: string;
  stagingStatus?: string;
}> {
  try {
    const { companyId } = await getAuthState();
    if (!companyId) return { isImported: false };

    const { data, error } = await supabase
      .from("deal_import_staging")
      .select("id, status")
      .eq("company_id", companyId)
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
        error: "Nicht eingeloggt. Bitte melde dich im Extension-Popup mit deinem FlipOS Account an."
      };
    }

    const insertPayload = {
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
      status: "pending"
    };

    const { data, error } = await supabase
      .from("deal_import_staging")
      .insert(insertPayload)
      .select("id")
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, stagingId: data.id };
  } catch (err: any) {
    return { success: false, error: err?.message || "Fehler beim Import nach FlipOS" };
  }
}
