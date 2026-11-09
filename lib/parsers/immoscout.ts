import type { ExtractedDealPayload } from "../../types";

export function parseImmoScout(): ExtractedDealPayload | null {
  const url = window.location.href;
  if (!url.includes("immobilienscout24.de/expose/")) {
    return null;
  }

  const idMatch = url.match(/\/expose\/(\d+)/);
  const externalId = idMatch ? idMatch[1] : undefined;

  // Title
  const title =
    document.querySelector("#expose-title")?.textContent?.trim() ||
    document.querySelector("h1")?.textContent?.trim() ||
    document.title;

  // Clean numerical helpers
  const parseNum = (text: string | null | undefined): number | undefined => {
    if (!text) return undefined;
    const clean = text.replace(/[^0-9,\.]/g, "").replace(/\./g, "").replace(",", ".");
    const val = parseFloat(clean);
    return isNaN(val) ? undefined : val;
  };

  // Price
  const priceEl =
    document.querySelector(".is24qa-kaufpreis") ||
    document.querySelector("[data-qa='kaufpreis']") ||
    document.querySelector(".is24-primary-tags span");
  const purchasePriceEur = parseNum(priceEl?.textContent);
  const purchasePriceCents = purchasePriceEur ? Math.round(purchasePriceEur * 100) : undefined;

  // Living Area
  const areaEl =
    document.querySelector(".is24qa-wohnflaeche-ca") ||
    document.querySelector("[data-qa='flaeche']") ||
    document.querySelector(".is24qa-flaeche");
  const livingAreaSqm = parseNum(areaEl?.textContent);

  // Rooms
  const roomsEl =
    document.querySelector(".is24qa-zi") ||
    document.querySelector("[data-qa='zimmer']") ||
    document.querySelector(".is24qa-zimmer");
  const rooms = parseNum(roomsEl?.textContent);

  // Address
  const addressBlock = document.querySelector(".address-block") || document.querySelector("[data-qa='address']");
  const fullAddress = addressBlock?.textContent?.replace(/\s+/g, " ")?.trim();

  // Try extracting zip and city
  let zip: string | undefined;
  let city: string | undefined;
  if (fullAddress) {
    const zipMatch = fullAddress.match(/\b(\d{5})\s+([^,]+)/);
    if (zipMatch) {
      zip = zipMatch[1];
      city = zipMatch[2]?.trim();
    }
  }

  // Energy & Baujahr
  let constructionYear: number | undefined;
  let energyClass: string | undefined;
  let energyValKwh: number | undefined;

  document.querySelectorAll("dd, .is24qa-baujahr, .is24qa-energieeffizienzklasse").forEach((el) => {
    const text = el.textContent || "";
    if (el.classList.contains("is24qa-baujahr") || text.includes("Baujahr")) {
      const yr = parseNum(text);
      if (yr && yr >= 1700 && yr <= 2035) constructionYear = Math.round(yr);
    }
    if (el.classList.contains("is24qa-energieeffizienzklasse")) {
      const match = text.match(/[A-H]\+?/i);
      if (match) energyClass = match[0].toUpperCase();
    }
  });

  // Images
  const imageUrls: string[] = [];
  document.querySelectorAll<HTMLImageElement>("img.sp-image, .gallery-container img, [data-qa='gallery-image']").forEach((img) => {
    const src = img.src || img.getAttribute("data-src") || img.getAttribute("data-lazy");
    if (src && !src.includes("data:image") && !imageUrls.includes(src)) {
      imageUrls.push(src);
    }
  });

  // Broker Contact
  const brokerCompany =
    document.querySelector(".offerer-name")?.textContent?.trim() ||
    document.querySelector("[data-qa='company-name']")?.textContent?.trim();

  return {
    portal: "immoscout24",
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
      construction_year: constructionYear,
      energy_class: energyClass,
      energy_val_kwh: energyValKwh
    },
    contact: {
      broker_company: brokerCompany
    },
    media: {
      cover_image_url: imageUrls[0],
      image_urls: imageUrls.slice(0, 15)
    },
    description: document.querySelector(".is24qa-objektbeschreibung")?.textContent?.trim(),
    extracted_at: new Date().toISOString()
  };
}
