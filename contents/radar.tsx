import type { PlasmoCSConfig, PlasmoGetStyle } from "plasmo";
import cssText from "data-text:~/style.css";
import React, { useState, useEffect } from "react";
import { extractDealFromCurrentPage } from "../lib/parsers";
import { checkDealStatus, pushDealToStaging } from "../lib/supabase";
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
  const [status, setStatus] = useState<"idle" | "checking" | "imported" | "pushing" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stagingId, setStagingId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  useEffect(() => {
    // Wait for DOM to stabilize
    const timer = setTimeout(async () => {
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
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

  if (!deal) return null;

  const handleImport = async () => {
    setStatus("pushing");
    setErrorMessage(null);
    const result = await pushDealToStaging(deal);

    if (result.success) {
      setStatus("success");
      setStagingId(result.stagingId || null);
    } else {
      setStatus("error");
      setErrorMessage(result.error || "Import fehlgeschlagen");
    }
  };

  const formattedPrice = deal.financials?.purchase_price_eur
    ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(deal.financials.purchase_price_eur)
    : "Preis n. a.";

  const formattedArea = deal.specs?.living_area_sqm
    ? `${deal.specs.living_area_sqm} m²`
    : "Fläche n. a.";

  return (
    <div className="fixed bottom-6 right-6 z-[999999] font-sans antialiased select-none">
      {/* Mini Radar Pill / Kapsel */}
      <div className="flex flex-col items-end gap-2">
        {isExpanded && (
          <div className="bg-slate-900 text-white rounded-xl shadow-2xl p-4 w-80 border border-slate-700 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">FlipOS Radar</span>
              </div>
              <button
                onClick={() => setIsExpanded(false)}
                className="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded bg-slate-800"
              >
                ✕
              </button>
            </div>

            <div className="py-3 space-y-1.5">
              <p className="text-sm font-medium text-white truncate" title={deal.title}>
                {deal.title}
              </p>
              <div className="flex items-center gap-3 text-xs text-slate-300">
                <span className="font-semibold text-emerald-400">{formattedPrice}</span>
                <span>•</span>
                <span>{formattedArea}</span>
                {deal.specs?.rooms && (
                  <>
                    <span>•</span>
                    <span>{deal.specs.rooms} Zi.</span>
                  </>
                )}
              </div>
              {deal.address?.full_address && (
                <p className="text-xs text-slate-400 truncate">{deal.address.full_address}</p>
              )}
            </div>

            {errorMessage && (
              <div className="mb-3 p-2 bg-red-950/80 border border-red-800 text-red-200 rounded text-xs">
                {errorMessage}
              </div>
            )}

            <div className="pt-2">
              {status === "imported" || status === "success" ? (
                <div className="flex items-center justify-between p-2 rounded bg-emerald-950/60 border border-emerald-700 text-emerald-300 text-xs">
                  <span>✓ Deal in Staging</span>
                  {stagingId && (
                    <span className="text-[10px] text-emerald-400 opacity-80 font-mono">
                      ID: {stagingId.slice(0, 8)}
                    </span>
                  )}
                </div>
              ) : (
                <button
                  onClick={handleImport}
                  disabled={status === "pushing"}
                  className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-2 shadow-md transition-colors"
                >
                  {status === "pushing" ? "Übertrage an FlipOS..." : "1-Klick Import nach FlipOS"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Collapsed Pill Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`flex items-center gap-2.5 px-3.5 py-2 rounded-full shadow-xl transition-all duration-200 border ${
            status === "imported" || status === "success"
              ? "bg-emerald-900/90 hover:bg-emerald-800 border-emerald-600 text-emerald-100"
              : "bg-slate-900/95 hover:bg-slate-800 border-indigo-500/50 text-white"
          }`}
        >
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              status === "imported" || status === "success"
                ? "bg-emerald-400"
                : "bg-indigo-400 animate-pulse"
            }`}
          />
          <span className="text-xs font-semibold tracking-wide">
            {status === "imported" || status === "success" ? "FlipOS ✓ Erfasst" : "FlipOS Radar"}
          </span>
          <span className="text-[11px] font-mono text-slate-300 border-l border-slate-700 pl-2">
            {formattedPrice}
          </span>
        </button>
      </div>
    </div>
  );
};

export default RadarOverlay;
