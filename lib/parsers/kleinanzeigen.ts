import type { ExtractedDealPayload } from "../../types";

export function parseKleinanzeigen(): ExtractedDealPayload | null {
  const url = window.location.href;
  if (!url.includes("kleinanzeigen.de/s-anzeige/")) {
    return null;
  }

  const idMatch = url.match(/\/s-anzeige\/.*?\/(\d+)-/);
  const externalId = idMatch ? idMatch[1] : undefined;

  const title =
    document.querySelector("#viewad-title")?.textContent?.trim() ||
    document.querySelector("h1")?.textContent?.trim() ||
    document.title;

  const parseNum = (text: string | null | undefined): number | undefined => {
    if (!text) return undefined;
    const clean = text.replace(/[^0-9,\.]/g, "").replace(/\./g, "").replace(",", ".");
    const val = parseFloat(clean);
    return isNaN(val) ? undefined : val;
  };

  const priceEl = document.querySelector("#viewad-price");
  const purchasePriceEur = parseNum(priceEl?.textContent);
  const purchasePriceCents = purchasePriceEur ? Math.round(purchasePriceEur * 100) : undefined;

  let livingAreaSqm: number | undefined;
  let rooms: number | undefined;
  let constructionYear: number | undefined;

  document.querySelectorAll("#viewad-details li, #viewad-details dt, #viewad-details dd").forEach((el) => {
    const text = el.textContent || "";
    if (text.includes("Wohnfläche") || text.includes("m²")) {
      const parsed = parseNum(text);
      if (parsed && !livingAreaSqm) livingAreaSqm = parsed;
    }
    if (text.includes("Zimmer")) {
      const parsed = parseNum(text);
      if (parsed && !rooms) rooms = parsed;
    }
    if (text.includes("Baujahr")) {
      const parsed = parseNum(text);
      if (parsed && parsed >= 1700 && parsed <= 2035) constructionYear = Math.round(parsed);
    }
  });

  const fullAddress = document.querySelector("#viewad-locality")?.textContent?.replace(/\s+/g, " ")?.trim();
  let zip: string | undefined;
  let city: string | undefined;
  if (fullAddress) {
    const zipMatch = fullAddress.match(/\b(\d{5})\s+([^,]+)/);
    if (zipMatch) {
      zip = zipMatch[1];
      city = zipMatch[2]?.trim();
    }
  }

  const imageUrls: string[] = [];
  document.querySelectorAll<HTMLImageElement>("#viewad-image, .ad-image img, #viewad-gallery img").forEach((img) => {
    const src = img.src || img.getAttribute("data-src");
    if (src && !src.includes("data:image") && !imageUrls.includes(src)) {
      imageUrls.push(src);
    }
  });

  return {
    portal: "kleinanzeigen",
    external_id: externalId,
    source_url: url,
    title,
    address: {
      zip,
      city,
      full_address: fullAddress
    },
    financials: {
      purchase_price_eur: purchasePriceEur,
      purchase_price_cents: purchasePriceCents,
      price_per_sqm_eur: purchasePriceEur && livingAreaSqm ? Math.round(purchasePriceEur / livingAreaSqm) : undefined
    },
    specs: {
      living_area_sqm: livingAreaSqm,
      rooms,
      construction_year: constructionYear
    },
    media: {
      cover_image_url: imageUrls[0],
      image_urls: imageUrls.slice(0, 15)
    },
    description: document.querySelector("#viewad-description-text")?.textContent?.trim(),
    extracted_at: new Date().toISOString()
  };
}
