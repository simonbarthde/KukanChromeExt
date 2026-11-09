import type { ExtractedDealPayload } from "../../types";

export function parseImmowelt(): ExtractedDealPayload | null {
  const url = window.location.href;
  if (!url.includes("immowelt.de/expose/")) {
    return null;
  }

  const idMatch = url.match(/\/expose\/([a-zA-Z0-9_-]+)/);
  const externalId = idMatch ? idMatch[1] : undefined;

  const title =
    document.querySelector("h1")?.textContent?.trim() ||
    document.title;

  const parseNum = (text: string | null | undefined): number | undefined => {
    if (!text) return undefined;
    const clean = text.replace(/[^0-9,\.]/g, "").replace(/\./g, "").replace(",", ".");
    const val = parseFloat(clean);
    return isNaN(val) ? undefined : val;
  };

  const priceEl =
    document.querySelector("[data-qa='hardfact-price']") ||
    document.querySelector(".hardfacts__cell--price");
  const purchasePriceEur = parseNum(priceEl?.textContent);
  const purchasePriceCents = purchasePriceEur ? Math.round(purchasePriceEur * 100) : undefined;

  const areaEl =
    document.querySelector("[data-qa='hardfact-area']") ||
    document.querySelector(".hardfacts__cell--area");
  const livingAreaSqm = parseNum(areaEl?.textContent);

  const roomsEl =
    document.querySelector("[data-qa='hardfact-rooms']") ||
    document.querySelector(".hardfacts__cell--rooms");
  const rooms = parseNum(roomsEl?.textContent);

  const fullAddress =
    document.querySelector("[data-qa='address']")?.textContent?.replace(/\s+/g, " ")?.trim();

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
  document.querySelectorAll<HTMLImageElement>("img.gallery-image, [data-qa='media-gallery'] img").forEach((img) => {
    const src = img.src || img.getAttribute("data-src");
    if (src && !src.includes("data:image") && !imageUrls.includes(src)) {
      imageUrls.push(src);
    }
  });

  return {
    portal: "immowelt",
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
      rooms
    },
    media: {
      cover_image_url: imageUrls[0],
      image_urls: imageUrls.slice(0, 15)
    },
    extracted_at: new Date().toISOString()
  };
}
