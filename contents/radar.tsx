import type { PlasmoCSConfig, PlasmoGetStyle } from "plasmo";
import cssText from "data-text:~/style.css";
import React, { useState, useEffect } from "react";
import { extractDealFromCurrentPage } from "../lib/parsers";
import { checkDealStatus, pushDealToStaging, getAuthState, AuthState } from "../lib/supabase";
import { getOrRecordPriceHistory, PriceHistoryInfo } from "../lib/price-history";
import type { ExtractedDealPayload } from "../types";

export const config: PlasmoCSConfig = {
  matches: [
    "https://*.immobilienscout24.de/expose/*",
    "https://*.immowelt.de/expose/*",
    "https://*.kleinanzeigen.de/s-anzeige/*"
  ]
};

export const getStyle: PlasmoGetStyle = () => {
  const style = document.createElement("style");
  style.textContent = cssText;
  return style;
};

const RadarOverlay: React.FC = () => {
  const [deal, setDeal] = useState<ExtractedDealPayload | null>(null);
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryInfo | null>(null);
  const [status, setStatus] = useState<"idle" | "checking" | "imported" | "pushing" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stagingId, setStagingId] = useState<string | null>(null);
  const [showHistoryFlyout, setShowHistoryFlyout] = useState<boolean>(false);
  const [isDemoDropActive, setIsDemoDropActive] = useState<boolean>(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      // 1. Auth state (defaults to Simon Barth dev persona)
      const currentAuth = await getAuthState();
      setAuthState(currentAuth);

      // 2. Extract deal data
      const extracted = extractDealFromCurrentPage();
      setDeal(extracted);

      if (extracted) {
        setStatus("checking");
        const res = await checkDealStatus(extracted.source_url);
        if (res.isImported) {
          setStatus("imported");
          setStagingId(res.stagingId || null);
        } else {
          setStatus("idle");
        }

        // 3. Price History & Days on Market
        const price = extracted.financials?.purchase_price_eur || 350000;
        const historyInfo = await getOrRecordPriceHistory(
          extracted.portal,
          extracted.external_id || "demo-id",
          price
        );
        setPriceHistory(historyInfo);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, []);

  if (!deal) return null;

  const currentPrice = deal.financials?.purchase_price_eur || 0;
  const formattedPrice = currentPrice > 0
    ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(currentPrice)
    : "Preis n. a.";

  const formattedArea = deal.specs?.living_area_sqm
    ? `${deal.specs.living_area_sqm} m²`
    : null;

  const formattedRooms = deal.specs?.rooms
    ? `${deal.specs.rooms} Zi.`
    : null;

  const handleImport = async () => {
    setStatus("pushing");
    setErrorMessage(null);
    // Re-extract fresh from current DOM state in case of lazy-loaded sections
    const freshDeal = extractDealFromCurrentPage() || deal;
    setDeal(freshDeal);
    const result = await pushDealToStaging(freshDeal);

    if (result.success) {
      setStatus("success");
      setStagingId(result.stagingId || null);
    } else {
      setStatus("error");
      setErrorMessage(result.error || "Import fehlgeschlagen");
    }
  };

  // Standzeit Styling
  const daysOnMarket = priceHistory?.daysOnMarket || 1;
  const daysBadgeColor =
    daysOnMarket > 45
      ? "bg-rose-950/80 text-rose-300 border-rose-700/80"
      : daysOnMarket > 20
      ? "bg-amber-950/80 text-amber-300 border-amber-700/80"
      : "bg-emerald-950/80 text-emerald-300 border-emerald-700/80";

  // Simulate demo drop for presentation/prototyping
  const activeHistory: PriceHistoryInfo = isDemoDropActive && priceHistory
    ? {
        ...priceHistory,
        daysOnMarket: 42,
        initialPriceEur: Math.round(currentPrice * 1.085),
        totalChangeEur: -Math.round(currentPrice * 0.085),
        totalChangePct: -8.5,
        history: [
          { date: "28.09.2026", priceEur: Math.round(currentPrice * 1.085) },
          { date: "15.10.2026", priceEur: Math.round(currentPrice * 1.035), changeEur: -Math.round(currentPrice * 0.05), changePct: -4.6 },
          { date: "02.11.2026", priceEur: currentPrice, changeEur: -Math.round(currentPrice * 0.035), changePct: -3.4 }
        ]
      }
    : priceHistory || {
        currentPriceEur: currentPrice,
        initialPriceEur: currentPrice,
        totalChangeEur: 0,
        totalChangePct: 0,
        firstSeenDate: new Date().toISOString().split("T")[0],
        daysOnMarket: 1,
        history: [{ date: new Date().toLocaleDateString("de-DE"), priceEur: currentPrice }]
      };

  return (
    <div className="fixed bottom-6 right-8 z-[2147483647] font-sans antialiased select-none">
      <div className="relative">
        {/* ============================================================== */}
        {/* MOUSEOVER FLYOUT: PREISHISTORIE ("ROTE KAPSEL" STYLE)        */}
        {/* ============================================================== */}
        {showHistoryFlyout && (
          <div
            onMouseEnter={() => setShowHistoryFlyout(true)}
            onMouseLeave={() => setShowHistoryFlyout(false)}
            className="absolute bottom-full right-0 mb-3 w-[440px] bg-slate-950/98 backdrop-blur-xl border-2 border-indigo-500/60 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] p-5 text-white animate-in fade-in slide-in-from-bottom-3 duration-200"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Preisentwicklung &amp; Standzeit
                </span>
              </div>
              <button
                onClick={() => setIsDemoDropActive(!isDemoDropActive)}
                className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 font-mono transition-colors"
                title="Zwischen Live-Daten und Demo-Preissenkung umschalten"
              >
                {isDemoDropActive ? "Demo: -8,5% an" : "+ Demo-Drop testen"}
              </button>
            </div>

            {/* Standzeit Tacho & Key Stats */}
            <div className="grid grid-cols-2 gap-3 py-3 border-b border-slate-800/80">
              <div className="p-2.5 bg-slate-900/90 rounded-xl border border-slate-800">
                <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                  Standzeit
                </div>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-xl font-bold font-mono text-white">
                    {activeHistory.daysOnMarket}
                  </span>
                  <span className="text-xs text-slate-400">Tage online</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  {activeHistory.daysOnMarket > 30 ? "⚠️ Langer Leerstand / Verhandlungshebel" : "✓ Frisches Inserat"}
                </div>
              </div>

              <div className="p-2.5 bg-slate-900/90 rounded-xl border border-slate-800">
                <div className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
                  Preisentwicklung
                </div>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span
                    className={`text-xl font-bold font-mono ${
                      activeHistory.totalChangePct < 0 ? "text-emerald-400" : "text-slate-300"
                    }`}
                  >
                    {activeHistory.totalChangePct < 0
                      ? `${activeHistory.totalChangePct}%`
                      : "0,0 %"}
                  </span>
                  {activeHistory.totalChangeEur !== 0 && (
                    <span className="text-xs font-mono text-emerald-400/90">
                      ({new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(activeHistory.totalChangeEur)})
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Start: {new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(activeHistory.initialPriceEur)}
                </div>
              </div>
            </div>

            {/* Historien-Treppe */}
            <div className="py-3">
              <div className="text-[11px] font-semibold text-slate-300 mb-2 flex items-center justify-between">
                <span>Historische Preispunkte</span>
                <span className="text-[10px] text-slate-500 font-mono">Radar Tracking</span>
              </div>

              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {activeHistory.history.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-900/70 border border-slate-800/80 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                      <span className="text-slate-300 font-mono text-[11px]">{item.date}</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="font-semibold text-white">
                        {new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(item.priceEur)}
                      </span>
                      {item.changePct && item.changePct !== 0 && (
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${item.changePct < 0 ? "bg-emerald-950 text-emerald-300 border border-emerald-800" : "bg-rose-950 text-rose-300"}`}>
                          {item.changePct}%
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
              <span>Erfasst im FlipOS Deal Radar</span>
              <span className="text-indigo-400 font-mono">Tenant: Nice Immobilien GmbH</span>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* GROSSES, PROMINENTES FLIPOS RADAR DOCK (HAUPT-ELEMENT)         */}
        {/* ============================================================== */}
        <div className="flex items-center bg-slate-950/95 backdrop-blur-xl border-2 border-indigo-500/70 hover:border-indigo-400 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.7)] p-2 gap-3 transition-all duration-200">
          {/* 1. Radar Brand Icon & Portal Tag */}
          <div className="flex items-center gap-2 pl-2">
            <div className="relative flex items-center justify-center size-8 rounded-xl bg-indigo-600/30 border border-indigo-500/50 shadow-inner">
              <div className="size-3 rounded-full bg-rose-500 animate-ping absolute opacity-75" />
              <div className="size-2.5 rounded-full bg-rose-500 relative shadow-[0_0_8px_#f43f5e]" />
            </div>
            <div className="pr-1">
              <div className="text-[10px] uppercase font-bold tracking-wider text-indigo-400 leading-tight">
                FlipOS Radar
              </div>
              <div className="text-[11px] font-semibold text-slate-300 uppercase">
                {deal.portal}
              </div>
            </div>
          </div>

          <div className="h-8 w-px bg-slate-800" />

          {/* 2. Interaktives Preis- & Standzeit-Badge (Hover Trigger) */}
          <div
            onMouseEnter={() => setShowHistoryFlyout(true)}
            className="flex items-center gap-2.5 px-2 py-1 rounded-xl hover:bg-slate-900/80 cursor-pointer transition-colors"
            title="Maus hier halten für Preishistorie & Standzeit-Tacho"
          >
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-bold font-mono text-emerald-400 tracking-tight">
                  {formattedPrice}
                </span>
                {activeHistory.totalChangePct < 0 && (
                  <span className="text-[10px] font-semibold font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-800 px-1.5 py-0.5 rounded">
                    📉 {activeHistory.totalChangePct}%
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                {formattedArea && <span>{formattedArea}</span>}
                {formattedRooms && (
                  <>
                    <span>•</span>
                    <span>{formattedRooms}</span>
                  </>
                )}
              </div>
            </div>

            {/* Standzeit Pill */}
            <div className={`px-2 py-1 rounded-lg border text-[11px] font-medium flex items-center gap-1 ${daysBadgeColor}`}>
              <span>⏱️</span>
              <span>{activeHistory.daysOnMarket}d</span>
            </div>
          </div>

          <div className="h-8 w-px bg-slate-800" />

          {/* 3. FlipOS 1-Klick Import Action Button */}
          <div className="pr-1">
            {status === "imported" || status === "success" ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-3 py-2 bg-emerald-950/80 border border-emerald-600/80 rounded-xl text-emerald-300 text-xs font-semibold shadow-inner">
                  <span className="text-sm">✓</span>
                  <span>In Inbox</span>
                </div>
                <button
                  onClick={handleImport}
                  disabled={status === "pushing"}
                  className="flex items-center gap-1.5 px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium transition-colors border border-slate-700 hover:border-slate-600"
                  title="Erneut nach FlipOS übertragen (z. B. nach Löschung oder Aktualisierung)"
                >
                  <span>🔄</span>
                  <span>Erneut importieren</span>
                </button>
                <a
                  href="https://kukan.vercel.app/inbox"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md transition-colors"
                >
                  <span>FlipOS</span>
                  <span>↗</span>
                </a>
              </div>
            ) : (
              <button
                onClick={handleImport}
                disabled={status === "pushing"}
                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white rounded-xl text-xs font-bold shadow-[0_4px_15px_rgba(79,70,229,0.4)] transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>⚡</span>
                <span>{status === "pushing" ? "Übertrage..." : "1-Klick Import nach FlipOS"}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RadarOverlay;
