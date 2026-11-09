import React, { useState, useEffect } from "react";
import { getAuthState, setDevAuth, loginWithEmail, logout, pushDealToStaging, checkDealStatus, AuthState } from "./lib/supabase";
import { Storage } from "@plasmohq/storage";
import "./style.css";

const storage = new Storage();

const Popup = () => {
  const [authState, setAuthState] = useState<AuthState>({ user: null, companyId: null, companyName: null, isDevMode: true });
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  // Login form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  // Tab & Deal State
  const [currentUrl, setCurrentUrl] = useState<string>("");
  const [importedDealsCount, setImportedDealsCount] = useState<number>(0);

  // Initial load
  useEffect(() => {
    async function init() {
      setIsLoadingAuth(true);
      const state = await getAuthState();
      setAuthState(state);

      const devDeals = (await storage.get<any[]>("flipos_staging_deals")) || [];
      setImportedDealsCount(devDeals.length);

      setIsLoadingAuth(false);

      if (typeof chrome !== "undefined" && chrome.tabs) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.url) {
            setCurrentUrl(tabs[0].url);
          }
        });
      }
    }

    init();
  }, []);

  const handleDevLogin = async () => {
    await setDevAuth(true);
    const state = await getAuthState();
    setAuthState(state);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsSubmitting(true);

    const result = await loginWithEmail(email, password);
    if (result.success) {
      const state = await getAuthState();
      setAuthState(state);
    } else {
      setLoginError(result.error || "Login fehlgeschlagen");
    }
    setIsSubmitting(false);
  };

  const handleLogout = async () => {
    await logout();
    setAuthState({ user: null, companyId: null, companyName: null, isDevMode: false });
  };

  const isSupportedPortal =
    currentUrl.includes("immobilienscout24.de") ||
    currentUrl.includes("immowelt.de") ||
    currentUrl.includes("kleinanzeigen.de");

  return (
    <div className="w-[380px] min-h-[460px] bg-slate-950 text-slate-100 font-sans flex flex-col justify-between select-none">
      {/* Top Header */}
      <div>
        <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="size-3 rounded-full bg-rose-500 shadow-[0_0_10px_#f43f5e] animate-pulse" />
            <span className="text-sm font-bold tracking-wide text-white">FlipOS Sourcing Radar</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-950 border border-indigo-700 text-indigo-300 font-mono font-medium">
            Prototyp V1
          </span>
        </div>

        {/* Content Body */}
        <div className="p-4 space-y-4">
          {isLoadingAuth ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <span>Verbinde mit FlipOS...</span>
            </div>
          ) : authState.user ? (
            /* Authenticated User Status */
            <div className="space-y-3.5">
              {/* Active Workspace Card */}
              <div className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span className="text-[11px] font-semibold text-white">
                      {authState.user.email}
                    </span>
                  </div>
                  {authState.isDevMode && (
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-amber-950 border border-amber-800 text-amber-300">
                      Dev Account
                    </span>
                  )}
                </div>

                <div className="text-xs text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/80">
                  <span>Mandant / Workspace:</span>
                  <span className="font-semibold text-slate-200">
                    {authState.companyName || "Nice Immobilien GmbH"}
                  </span>
                </div>
              </div>

              {/* Portal Radar Status */}
              <div className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-xl space-y-2">
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Radar Status
                </div>

                {isSupportedPortal ? (
                  <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-800/60 p-2.5 rounded-lg">
                    <span className="text-base">🎯</span>
                    <div>
                      <div className="font-semibold">Portal erkannt</div>
                      <div className="text-[11px] text-emerald-400/90">
                        Das große Radar-Dock ist unten rechts auf der Seite aktiv.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 text-xs text-slate-300 bg-slate-800/40 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-base">ℹ️</span>
                    <div className="text-[11px] text-slate-400 leading-snug">
                      Öffne ein Exposé auf <strong>ImmoScout24</strong>, <strong>Immowelt</strong> oder <strong>Kleinanzeigen</strong>, um das Radar mit Preishistorie zu nutzen.
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                  <span>Erfasste Deals in Session:</span>
                  <span className="font-mono font-bold text-white bg-slate-800 px-2 py-0.5 rounded">
                    {importedDealsCount}
                  </span>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="pt-1 flex items-center gap-2">
                <button
                  onClick={handleLogout}
                  className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors"
                >
                  Abmelden
                </button>
              </div>
            </div>
          ) : (
            /* Unauthenticated / Login Choice */
            <div className="space-y-4">
              <div className="text-center py-2">
                <div className="size-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center mx-auto mb-2 text-xl">
                  ⚡
                </div>
                <h2 className="text-sm font-bold text-white">FlipOS Dev Account</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Für den Prototypen und Tests kannst du dich direkt mit dem Simon Barth Dev Account verbinden:
                </p>
              </div>

              {/* Big 1-Click Dev Button */}
              <button
                onClick={handleDevLogin}
                className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl text-xs font-bold shadow-[0_4px_20px_rgba(79,70,229,0.4)] flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>⚡</span>
                <span>1-Klick Dev-Login (Simon Barth)</span>
              </button>

              <div className="text-center">
                <button
                  onClick={() => setShowPasswordForm(!showPasswordForm)}
                  className="text-[11px] text-slate-500 hover:text-slate-300 underline"
                >
                  {showPasswordForm ? "Passwort-Formular ausblenden" : "Alternativ: Mit Passwort anmelden"}
                </button>
              </div>

              {showPasswordForm && (
                <form onSubmit={handleLogin} className="space-y-3 pt-2 border-t border-slate-800">
                  {loginError && (
                    <div className="p-2 bg-rose-950/70 border border-rose-800 text-rose-200 rounded text-xs">
                      {loginError}
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      E-Mail Adresse
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="simon@flipos.dev"
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
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-semibold"
                  >
                    {isSubmitting ? "Wird geprüft..." : "Anmelden"}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 bg-slate-900 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
        <span className="font-mono text-[10px] text-slate-500">FlipOS Dev Edition</span>
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
