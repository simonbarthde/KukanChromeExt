import type { ExtractedDealPayload } from "../../types";

export function parseImmoScout(): ExtractedDealPayload | null {
  const url = window.location.href;
  if (!url.includes("immobilienscout24.de/expose/")) {
    return null;
  }

  const idMatch = url.match(/\/expose\/(\d+)/);
  const externalId = idMatch ? idMatch[1] : undefined;

  // Helper: clean numbers
  const parseNum = (text: string | null | undefined): number | undefined => {
    if (!text) return undefined;
    const clean = text.replace(/[^0-9,\.]/g, "").replace(/\./g, "").replace(",", ".");
    const val = parseFloat(clean);
    return isNaN(val) ? undefined : val;
  };

  let title = document.querySelector("#expose-title")?.textContent?.trim() ||
    document.querySelector("h1")?.textContent?.trim() ||
    document.title;

  let purchasePriceEur: number | undefined;
  let livingAreaSqm: number | undefined;
  let rooms: number | undefined;
  let constructionYear: number | undefined;
  let energyClass: string | undefined;
  let energyValKwh: number | undefined;
  let street: string | undefined;
  let houseNumber: string | undefined;
  let zip: string | undefined;
  let city: string | undefined;
  let fullAddress: string | undefined;
  let brokerCompany: string | undefined;
  let brokerName: string | undefined;
  let monthlyHausgeld: number | undefined;
  let brokerCommission: number | undefined;
  let description: string | undefined;
  const imageUrls: string[] = [];

  // ===========================================================================
  // TIER 1: __NEXT_DATA__ (Direct JSON from Next.js - Complete & High-Res)
  // ===========================================================================
  try {
    const nextDataEl = document.getElementById("__NEXT_DATA__");
    if (nextDataEl?.textContent) {
      const data = JSON.parse(nextDataEl.textContent);
      const expose = data?.props?.pageProps?.expose || data?.props?.pageProps?.initialState?.expose;
      const re = expose?.realEstate;

      if (re) {
        if (re.title) title = re.title;
        if (re.price?.value) purchasePriceEur = re.price.value;
        if (re.livingSpace) livingAreaSqm = re.livingSpace;
        if (re.numberOfRooms) rooms = re.numberOfRooms;
        if (re.constructionYear) constructionYear = re.constructionYear;

        // Address
        if (re.address) {
          street = re.address.street;
          houseNumber = re.address.houseNumber;
          zip = re.address.postcode;
          city = re.address.city;
          fullAddress = [street, houseNumber, zip, city].filter(Boolean).join(" ");
        }

        // Energy
        if (re.energyCertificate) {
          energyClass = re.energyCertificate.energyEfficiencyClass;
          energyValKwh = re.energyCertificate.thermalCharacteristic || re.energyCertificate.energyConsumption;
        } else if (re.energyEfficiencyClass) {
          energyClass = re.energyEfficiencyClass;
        }

        // Hausgeld & Courtage
        if (re.serviceCharge) monthlyHausgeld = parseNum(String(re.serviceCharge));
        if (re.courtage?.courtage) brokerCommission = parseNum(re.courtage.courtage);

        // Broker Contact
        const contact = expose.contactDetails || re.contactDetails;
        if (contact) {
          brokerCompany = contact.companyName;
          brokerName = [contact.salutation, contact.firstname, contact.lastname].filter(Boolean).join(" ");
        }

        // Description
        description = re.descriptionNote || re.furnishingNote || re.locationNote;

        // High-Res Images from Attachments
        const attachments = re.attachments || re.galleryAttachments || [];
        if (Array.isArray(attachments)) {
          attachments.forEach((att: any) => {
            const urls = att?.urls;
            if (Array.isArray(urls)) {
              // Prefer SCALE_ORIGINAL, then SCALE_612x460, or any url
              const orig = urls.find((u: any) => u.scale === "SCALE_ORIGINAL" || u.scale === "SCALE_1024x768");
              const fallback = urls[0];
              const bestUrl = orig?.url || fallback?.url;
              if (bestUrl && !imageUrls.includes(bestUrl)) {
                imageUrls.push(bestUrl);
              }
            } else if (att?.url && !imageUrls.includes(att.url)) {
              imageUrls.push(att.url);
            }
          });
        }
      }
    }
  } catch (err) {
    console.warn("[immoscout parser] Next.js __NEXT_DATA__ extraction error:", err);
  }

  // ===========================================================================
  // TIER 2: JSON-LD Schema Fallback
  // ===========================================================================
  if (imageUrls.length === 0 || !fullAddress || !purchasePriceEur) {
    try {
      const jsonLdEls = document.querySelectorAll('script[type="application/ld+json"]');
      jsonLdEls.forEach((el) => {
        if (!el.textContent) return;
        const schema = JSON.parse(el.textContent);
        const obj = schema["@graph"] ? schema["@graph"].find((x: any) => x["@type"]?.includes("Residence") || x["@type"]?.includes("Place") || x["@type"]?.includes("Listing")) : schema;

        if (obj) {
          if (!purchasePriceEur && obj.offers?.price) {
            purchasePriceEur = parseNum(String(obj.offers.price));
          }
          if (!livingAreaSqm && obj.floorSize?.value) {
            livingAreaSqm = parseNum(String(obj.floorSize.value));
          }
          if (!rooms && obj.numberOfRooms) {
            rooms = parseNum(String(obj.numberOfRooms));
          }

          // Address from Schema
          if (!fullAddress && obj.address) {
            street = obj.address.streetAddress;
            zip = obj.address.postalCode;
            city = obj.address.addressLocality;
            fullAddress = [street, zip, city].filter(Boolean).join(" ");
          }

          // Images from Schema
          if (imageUrls.length === 0) {
            if (Array.isArray(obj.image)) {
              obj.image.forEach((img: any) => {
                const u = typeof img === "string" ? img : img?.url;
                if (u && !imageUrls.includes(u)) imageUrls.push(u);
              });
            } else if (typeof obj.image === "string") {
              imageUrls.push(obj.image);
            }
          }
        }
      });
    } catch (e) {
      // ignore
    }
  }

  // ===========================================================================
  // TIER 3: DOM Fallback & Key-Value DL/DD Scanning
  // ===========================================================================
  // 1. Price fallback
  if (!purchasePriceEur) {
    const priceEl =
      document.querySelector(".is24qa-kaufpreis") ||
      document.querySelector("[data-qa='kaufpreis']") ||
      document.querySelector(".is24-primary-tags span");
    purchasePriceEur = parseNum(priceEl?.textContent);
  }

  // 2. Area fallback
  if (!livingAreaSqm) {
    const areaEl =
      document.querySelector(".is24qa-wohnflaeche-ca") ||
      document.querySelector("[data-qa='flaeche']") ||
      document.querySelector(".is24qa-flaeche");
    livingAreaSqm = parseNum(areaEl?.textContent);
  }

  // 3. Rooms fallback
  if (!rooms) {
    const roomsEl =
      document.querySelector(".is24qa-zi") ||
      document.querySelector("[data-qa='zimmer']") ||
      document.querySelector(".is24qa-zimmer");
    rooms = parseNum(roomsEl?.textContent);
  }

  // 4. Address fallback: Scan entire address container or page for 5-digit PLZ
  if (!fullAddress) {
    const addrEl =
      document.querySelector("[data-qa='is24-expose-address']") ||
      document.querySelector("[data-qa='address']") ||
      document.querySelector(".address-block") ||
      document.querySelector(".zip-region-and-country");

    const rawAddr = addrEl?.textContent?.replace(/\s+/g, " ")?.trim();
    if (rawAddr) {
      fullAddress = rawAddr;
      const m = rawAddr.match(/\b(\d{5})\s+([^,]+)/);
      if (m) {
        zip = m[1];
        city = m[2]?.trim();
      }
    } else {
      // Scan body text for PLZ pattern in top 2000 chars
      const bodyText = document.body.innerText.slice(0, 3000);
      const m = bodyText.match(/\b(\d{5})\s+([A-ZÄÖÜ][a-zäöüß\s\-]+)/);
      if (m) {
        zip = m[1];
        city = m[2]?.trim();
        fullAddress = `${zip} ${city}`;
      }
    }
  }

  // 5. Key-Value pairs scan across all dl/dt/dd in the document
  document.querySelectorAll("dt").forEach((dt) => {
    const dtText = dt.textContent?.trim() || "";
    const dd = dt.nextElementSibling;
    const ddText = dd?.textContent?.trim() || "";

    if (!constructionYear && dtText.includes("Baujahr")) {
      const yr = parseNum(ddText);
      if (yr && yr >= 1700 && yr <= 2035) constructionYear = Math.round(yr);
    }

    if (!energyClass && dtText.includes("Energieeffizienzklasse")) {
      const match = ddText.match(/[A-H]\+?/i);
      if (match) energyClass = match[0].toUpperCase();
    }

    if (!energyValKwh && (dtText.includes("Endenergiebedarf") || dtText.includes("Energieverbrauch"))) {
      energyValKwh = parseNum(ddText);
    }

    if (!monthlyHausgeld && (dtText.includes("Hausgeld") || dtText.includes("Wohngeld"))) {
      monthlyHausgeld = parseNum(ddText);
    }

    if (!brokerCommission && (dtText.includes("Provision") || dtText.includes("Courtage"))) {
      brokerCommission = parseNum(ddText);
    }
  });

  // 6. OpenGraph Cover Image
  const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute("content");
  if (ogImage && !imageUrls.includes(ogImage)) {
    imageUrls.unshift(ogImage);
  }

  // 7. Comprehensive Image Crawler (all pictures hosted on pictures.immobilienscout24.de)
  if (imageUrls.length < 3) {
    document.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
      const src = img.src || img.getAttribute("data-src") || img.getAttribute("srcset");
      if (src && (src.includes("pictures.immobilienscout24.de") || src.includes("is24"))) {
        // If srcset, pick highest resolution
        let best = src;
        if (src.includes(",")) {
          const parts = src.split(",");
          best = parts[parts.length - 1].trim().split(" ")[0];
        }
        if (best.startsWith("http") && !imageUrls.includes(best) && !best.includes("icon") && !best.includes("logo")) {
          imageUrls.push(best);
        }
      }
    });
  }

  // 8. Broker Company fallback
  if (!brokerCompany) {
    brokerCompany =
      document.querySelector(".offerer-name")?.textContent?.trim() ||
      document.querySelector("[data-qa='company-name']")?.textContent?.trim() ||
      document.querySelector("[data-qa='contact-name']")?.textContent?.trim();
  }

  const purchasePriceCents = purchasePriceEur ? Math.round(purchasePriceEur * 100) : undefined;
  const pricePerSqm = purchasePriceEur && livingAreaSqm && livingAreaSqm > 0
    ? Math.round(purchasePriceEur / livingAreaSqm)
    : undefined;

  return {
    portal: "immoscout24",
    external_id: externalId,
    source_url: url,
    title,
    address: {
      street,
      house_number: houseNumber,
      zip,
      city,
      full_address: fullAddress || (zip && city ? `${zip} ${city}` : undefined)
    },
    financials: {
      purchase_price_eur: purchasePriceEur,
      purchase_price_cents: purchasePriceCents,
      price_per_sqm_eur: pricePerSqm,
      broker_commission_pct: brokerCommission,
      monthly_house_money_eur: monthlyHausgeld
    },
    specs: {
      living_area_sqm: livingAreaSqm,
      rooms,
      construction_year: constructionYear,
      energy_class: energyClass,
      energy_val_kwh: energyValKwh
    },
    contact: {
      broker_company: brokerCompany,
      broker_name: brokerName
    },
    media: {
      cover_image_url: imageUrls[0],
      image_urls: imageUrls.slice(0, 20)
    },
    description: description || document.querySelector(".is24qa-objektbeschreibung")?.textContent?.trim(),
    extracted_at: new Date().toISOString()
  };
}
