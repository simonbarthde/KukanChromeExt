import React, { useState, useEffect } from "react";
import { getAuthState, loginWithEmail, logout, pushDealToStaging, checkDealStatus, AuthState } from "./lib/supabase";
import { extractDealFromCurrentPage } from "./lib/parsers";
import type { ExtractedDealPayload } from "./types";
import "./style.css";

const Popup = () => {
  const [authState, setAuthState] = useState<AuthState>({ user: null, companyId: null, companyName: null });
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  // Login form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Tab & Deal State
  const [currentUrl, setCurrentUrl] = useState<string>("");
  const [deal, setDeal] = useState<ExtractedDealPayload | null>(null);
  const [isCheckingDeal, setIsCheckingDeal] = useState(false);
  const [isImported, setIsImported] = useState(false);
  const [stagingId, setStagingId] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<"idle" | "pushing" | "success" | "error">("idle");
  const [importError, setImportError] = useState<string | null>(null);

  // Initial load
  useEffect(() => {
    async function init() {
      setIsLoadingAuth(true);
      const state = await getAuthState();
      setAuthState(state);
      setIsLoadingAuth(false);

      if (typeof chrome !== "undefined" && chrome.tabs) {
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
          const tab = tabs[0];
          if (tab?.url) {
            setCurrentUrl(tab.url);

            // Execute extractor script in active tab to get live deal data
            if (tab.id && (tab.url.includes("immobilienscout24.de/expose/") || tab.url.includes("immowelt.de/expose/") || tab.url.includes("kleinanzeigen.de/s-anzeige/"))) {
              try {
                const results = await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: () => {
                    // Extract deal directly in page context
                    const url = window.location.href;
                    const cleanNum = (t?: string | null) => {
                      if (!t) return undefined;
                      const clean = t.replace(/[^0-9,\.]/g, "").replace(/\./g, "").replace(",", ".");
                      const val = parseFloat(clean);
                      return isNaN(val) ? undefined : val;
                    };

                    let title = document.querySelector("#expose-title, #viewad-title, h1")?.textContent?.trim() || document.title;
                    let price: number | undefined;
                    let area: number | undefined;
                    let rooms: number | undefined;
                    let fullAddress: string | undefined;

                    if (url.includes("immobilienscout24.de")) {
                      price = cleanNum(document.querySelector(".is24qa-kaufpreis, [data-qa='kaufpreis']")?.textContent);
                      area = cleanNum(document.querySelector(".is24qa-wohnflaeche-ca, [data-qa='flaeche']")?.textContent);
                      rooms = cleanNum(document.querySelector(".is24qa-zi, [data-qa='zimmer']")?.textContent);
                      fullAddress = document.querySelector(".address-block, [data-qa='address']")?.textContent?.replace(/\s+/g, " ")?.trim();
                    } else if (url.includes("kleinanzeigen.de")) {
                      price = cleanNum(document.querySelector("#viewad-price")?.textContent);
                      fullAddress = document.querySelector("#viewad-locality")?.textContent?.replace(/\s+/g, " ")?.trim();
                      document.querySelectorAll("#viewad-details li").forEach(el => {
                        const txt = el.textContent || "";
                        if (txt.includes("Wohnfläche") || txt.includes("m²")) area = cleanNum(txt);
                        if (txt.includes("Zimmer")) rooms = cleanNum(txt);
                      });
                    } else if (url.includes("immowelt.de")) {
                      price = cleanNum(document.querySelector("[data-qa='hardfact-price']")?.textContent);
                      area = cleanNum(document.querySelector("[data-qa='hardfact-area']")?.textContent);
                      rooms = cleanNum(document.querySelector("[data-qa='hardfact-rooms']")?.textContent);
                      fullAddress = document.querySelector("[data-qa='address']")?.textContent?.replace(/\s+/g, " ")?.trim();
                    }

                    return {
                      title,
                      price,
                      area,
                      rooms,
                      fullAddress
                    };
                  }
                });

                const raw = results?.[0]?.result;
                if (raw) {
                  setDeal({
                    portal: tab.url.includes("immobilienscout24") ? "immoscout24" : tab.url.includes("kleinanzeigen") ? "kleinanzeigen" : "immowelt",
                    source_url: tab.url,
                    title: raw.title,
                    address: { full_address: raw.fullAddress },
                    financials: { purchase_price_eur: raw.price },
                    specs: { living_area_sqm: raw.area, rooms: raw.rooms },
                    extracted_at: new Date().toISOString()
                  });
                }
              } catch (e) {
                console.error("Script execution failed:", e);
              }
            }

            // Check if already in staging
            if (state.companyId) {
              setIsCheckingDeal(true);
              const statusCheck = await checkDealStatus(tab.url);
              setIsImported(statusCheck.isImported);
              setStagingId(statusCheck.stagingId || null);
              setIsCheckingDeal(false);
            }
          }
        });
      }
    }

    init();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsSubmitting(true);

    const result = await loginWithEmail(email, password);
    if (result.success) {
      const state = await getAuthState();
      setAuthState(state);
      if (currentUrl) {
        const statusCheck = await checkDealStatus(currentUrl);
        setIsImported(statusCheck.isImported);
        setStagingId(statusCheck.stagingId || null);
      }
    } else {
      setLoginError(result.error || "Login fehlgeschlagen");
    }
    setIsSubmitting(false);
  };

  const handleLogout = async () => {
    await logout();
    setAuthState({ user: null, companyId: null, companyName: null });
    setIsImported(false);
    setStagingId(null);
  };

  const handleImport = async () => {
    if (!deal) return;
    setImportStatus("pushing");
    setImportError(null);

    const res = await pushDealToStaging(deal);
    if (res.success) {
      setImportStatus("success");
      setIsImported(true);
      setStagingId(res.stagingId || null);
    } else {
      setImportStatus("error");
      setImportError(res.error || "Fehler beim Import");
    }
  };

  const isSupportedPortal =
    currentUrl.includes("immobilienscout24.de/expose/") ||
    currentUrl.includes("immowelt.de/expose/") ||
    currentUrl.includes("kleinanzeigen.de/s-anzeige/");

  return (
    <div className="w-[360px] min-h-[440px] bg-slate-950 text-slate-100 font-sans flex flex-col justify-between select-none">
      {/* Top Header */}
      <div>
        <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)] animate-pulse" />
            <span className="text-sm font-semibold tracking-wide text-white">FlipOS Radar</span>
          </div>
          {authState.user && (
            <button
              onClick={handleLogout}
              className="text-[11px] text-slate-400 hover:text-rose-400 transition-colors"
              title="Abmelden"
            >
              Abmelden
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-4">
          {isLoadingAuth ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <span>Verbinde mit FlipOS...</span>
            </div>
          ) : !authState.user ? (
            /* Login Screen */
            <div className="space-y-4">
              <div className="text-center pb-1">
                <h2 className="text-sm font-semibold text-white">FlipOS Login</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Melde dich mit deinen Zugangsdaten an, um Inserate direkt zu erfassen.
                </p>
              </div>

              {loginError && (
                <div className="p-2.5 bg-rose-950/70 border border-rose-800/80 rounded text-rose-200 text-xs">
                  {loginError}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    E-Mail Adresse
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@investor.de"
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Passwort
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white rounded text-xs font-semibold shadow transition-colors mt-2"
                >
                  {isSubmitting ? "Wird eingeloggt..." : "In FlipOS einloggen"}
                </button>
              </form>
            </div>
          ) : (
            /* Authenticated Screen */
            <div className="space-y-3.5">
              {/* Active Workspace Badge */}
              <div className="px-3 py-2 bg-slate-900/80 border border-slate-800 rounded-lg flex items-center justify-between">
                <div className="truncate">
                  <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider">Workspace</div>
                  <div className="text-xs font-medium text-slate-200 truncate">
                    {authState.companyName || "FlipOS Workspace"}
                  </div>
                </div>
                <div className="text-right">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-950 border border-emerald-800 text-emerald-300">
                    Aktiv
                  </span>
                </div>
              </div>

              {/* Deal Card */}
              {isSupportedPortal ? (
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="uppercase font-semibold text-indigo-400 tracking-wider">
                      {deal?.portal || "Portal Deal"}
                    </span>
                    {isCheckingDeal ? (
                      <span className="text-slate-400">Prüfe Status...</span>
                    ) : isImported ? (
                      <span className="text-emerald-400 font-medium">✓ In FlipOS</span>
                    ) : (
                      <span className="text-amber-400 font-medium">Neu</span>
                    )}
                  </div>

                  <div className="text-xs font-medium text-white line-clamp-2">
                    {deal?.title || "Inserat erkannt"}
                  </div>

                  {deal && (
                    <div className="flex items-center gap-2 text-xs text-slate-300 pt-1 border-t border-slate-800/80">
                      {deal.financials?.purchase_price_eur && (
                        <span className="font-semibold text-emerald-400 font-mono">
                          {new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(deal.financials.purchase_price_eur)}
                        </span>
                      )}
                      {deal.specs?.living_area_sqm && (
                        <>
                          <span>•</span>
                          <span>{deal.specs.living_area_sqm} m²</span>
                        </>
                      )}
                      {deal.specs?.rooms && (
                        <>
                          <span>•</span>
                          <span>{deal.specs.rooms} Zi.</span>
                        </>
                      )}
                    </div>
                  )}

                  {deal?.address?.full_address && (
                    <div className="text-[11px] text-slate-400 truncate">
                      📍 {deal.address.full_address}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-lg text-center space-y-1.5">
                  <div className="text-xs text-amber-300 font-medium">Kein Exposé erkannt</div>
                  <div className="text-[11px] text-slate-400">
                    Öffne ein Inserat auf ImmoScout24, Immowelt oder Kleinanzeigen, um Daten per 1-Klick zu erfassen.
                  </div>
                </div>
              )}

              {importError && (
                <div className="p-2 bg-rose-950/80 border border-rose-800 text-rose-200 rounded text-xs">
                  {importError}
                </div>
              )}

              {/* Action Button */}
              {isSupportedPortal && (
                <div>
                  {isImported ? (
                    <div className="p-2.5 rounded bg-emerald-950/60 border border-emerald-700/80 text-emerald-300 text-xs flex items-center justify-between">
                      <span>✓ In Staging Inbox</span>
                      {stagingId && (
                        <span className="text-[10px] font-mono text-emerald-400">ID: {stagingId.slice(0, 8)}</span>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={handleImport}
                      disabled={importStatus === "pushing" || !deal}
                      className="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white rounded-lg text-xs font-semibold shadow-md flex items-center justify-center gap-2 transition-colors"
                    >
                      {importStatus === "pushing" ? "Übertrage an FlipOS..." : "1-Klick Import nach FlipOS"}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 bg-slate-900 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
        <span className="truncate max-w-[180px]">
          {authState.user?.email || "FlipOS Extension"}
        </span>
        <a
          href="https://kukan.vercel.app/deal-pipeline"
          target="_blank"
          rel="noreferrer"
          className="text-indigo-400 hover:text-indigo-300 font-medium"
        >
          Pipeline öffnen ↗
        </a>
      </div>
    </div>
  );
};

export default Popup;
