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

  // Helper: deep object search in JSON trees
  const findDeep = (obj: any, key: string, maxDepth = 6): any => {
    if (!obj || typeof obj !== "object" || maxDepth <= 0) return undefined;
    if (key in obj && obj[key] != null) return obj[key];
    for (const k of Object.keys(obj)) {
      try {
        const res = findDeep(obj[k], key, maxDepth - 1);
        if (res != null) return res;
      } catch {
        // ignore
      }
    }
    return undefined;
  };

  let title =
    document.querySelector("#expose-title")?.textContent?.trim() ||
    document.querySelector("h1")?.textContent?.trim() ||
    document.title;

  let purchasePriceEur: number | undefined;
  let livingAreaSqm: number | undefined;
  let rooms: number | undefined;
  let bedrooms: number | undefined;
  let bathrooms: number | undefined;
  let constructionYear: number | undefined;
  let energyClass: string | undefined;
  let energyValKwh: number | undefined;
  let energyCertificateType: string | undefined;
  let primaryEnergySource: string | undefined;
  let heatingType: string | undefined;
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
  // TIER 1: Next.js __NEXT_DATA__ (Direct JSON from Next.js)
  // ===========================================================================
  try {
    const nextDataEl = document.getElementById("__NEXT_DATA__");
    if (nextDataEl?.textContent) {
      const data = JSON.parse(nextDataEl.textContent);
      const expose = data?.props?.pageProps?.expose || data?.props?.pageProps?.initialState?.expose;
      const re = expose?.realEstate || findDeep(data, "realEstate");

      if (re) {
        if (re.title) title = re.title;
        if (re.price?.value) purchasePriceEur = re.price.value;
        if (re.livingSpace) livingAreaSqm = re.livingSpace;
        if (re.numberOfRooms) rooms = re.numberOfRooms;
        if (re.numberOfBedrooms) bedrooms = re.numberOfBedrooms;
        if (re.numberOfBathRooms) bathrooms = re.numberOfBathRooms;
        if (re.constructionYear) constructionYear = re.constructionYear;

        // Address
        if (re.address) {
          street = re.address.street;
          houseNumber = re.address.houseNumber;
          zip = re.address.postcode;
          city = re.address.city;
          fullAddress = [street, houseNumber, zip, city].filter(Boolean).join(" ");
        }

        // Energy Certificate from realEstate fields
        const ec = re.energyCertificate || expose?.energyCertificate || findDeep(data, "energyCertificate");
        if (ec) {
          if (ec.energyEfficiencyClass) energyClass = ec.energyEfficiencyClass;
          if (ec.thermalCharacteristic) energyValKwh = parseNum(String(ec.thermalCharacteristic));
          if (ec.energyConsumption) energyValKwh = energyValKwh || parseNum(String(ec.energyConsumption));
          if (ec.energyCertificateType) {
            energyCertificateType =
              ec.energyCertificateType === "BEDARF"
                ? "Bedarfsausweis"
                : ec.energyCertificateType === "VERBRAUCH"
                ? "Verbrauchsausweis"
                : ec.energyCertificateType;
          }
        }

        if (!energyClass && re.energyEfficiencyClass) {
          energyClass = re.energyEfficiencyClass;
        }

        // Firing types / Energy source
        const firing = re.firingTypes || re.energySourcesEnev2014?.energySource || ec?.energySources;
        if (Array.isArray(firing) && firing.length > 0) {
          primaryEnergySource = firing
            .map((f: any) => (typeof f === "string" ? f : f?.energySource || f?.name || ""))
            .filter(Boolean)
            .join(", ")
            .replace(/GAS/g, "Gas")
            .replace(/OIL|OEL/g, "Öl")
            .replace(/DISTRICT_HEATING/g, "Fernwärme")
            .replace(/ELECTRICITY/g, "Strom")
            .replace(/PELLET/g, "Pellets")
            .replace(/HEAT_PUMP/g, "Wärmepumpe");
        }

        // Heating type
        if (re.heatingType || re.heatingTypeEnev2014) {
          const ht = re.heatingType || re.heatingTypeEnev2014;
          heatingType = String(ht)
            .replace(/CENTRAL_HEATING/g, "Zentralheizung")
            .replace(/FLOOR_HEATING/g, "Fußbodenheizung")
            .replace(/SELF_CONTAINED_CENTRAL_HEATING/g, "Etagenheizung")
            .replace(/DISTRICT_HEATING/g, "Fernwärme")
            .replace(/HEAT_PUMP/g, "Wärmepumpe");
        }

        // Hausgeld & Courtage
        if (re.serviceCharge) monthlyHausgeld = parseNum(String(re.serviceCharge));
        if (re.courtage?.courtage) brokerCommission = parseNum(re.courtage.courtage);

        // Broker Contact
        const contact = expose?.contactDetails || re.contactDetails;
        if (contact) {
          brokerCompany = contact.companyName;
          brokerName = [contact.salutation, contact.firstname, contact.lastname].filter(Boolean).join(" ");
        }

        // Comprehensive description aggregation from JSON
        const descNote = re.descriptionNote || re.freeTexts?.descriptionNote || findDeep(data, "descriptionNote") || findDeep(data, "description");
        const furnNote = re.furnishingNote || re.freeTexts?.furnishingNote || findDeep(data, "furnishingNote");
        const locNote = re.locationNote || re.freeTexts?.locationNote || findDeep(data, "locationNote");
        const othNote = re.otherNote || re.freeTexts?.otherNote || findDeep(data, "otherNote");

        const notes = [
          re.title || title,
          descNote,
          furnNote,
          locNote,
          othNote
        ].filter(Boolean);
        if (notes.length > 0) {
          description = notes.join("\n\n");
        }

        // High-Res Images from Attachments
        const attachments = re.attachments || re.galleryAttachments || [];
        if (Array.isArray(attachments)) {
          attachments.forEach((att: any) => {
            const urls = att?.urls;
            if (Array.isArray(urls)) {
              const orig = urls.find((u: any) => u.scale === "SCALE_ORIGINAL" || u.scale === "SCALE_1024x768");
              const fallback = urls[0];
              const bestUrl = orig?.url || fallback?.url;
              if (bestUrl && !imageUrls.includes(bestUrl) && !bestUrl.includes("icon") && !bestUrl.includes("logo")) {
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
        const text = el.textContent;
        if (!text) return;
        const parsed = JSON.parse(text);
        const obj = Array.isArray(parsed) ? parsed[0] : parsed;
        if (obj) {
          if (!purchasePriceEur && obj.offers?.price) purchasePriceEur = parseNum(String(obj.offers.price));
          if (!fullAddress && obj.address) {
            street = obj.address.streetAddress;
            zip = obj.address.postalCode;
            city = obj.address.addressLocality;
            fullAddress = [street, zip, city].filter(Boolean).join(" ");
          }
          if (Array.isArray(obj.image)) {
            obj.image.forEach((img: any) => {
              const u = typeof img === "string" ? img : img?.contentUrl || img?.url;
              if (u && !imageUrls.includes(u)) imageUrls.push(u);
            });
          }
        }
      });
    } catch {
      // ignore JSON-LD errors
    }
  }

  // ===========================================================================
  // TIER 3: DOM Selectors for Core Metrics (Price, Area, Rooms, Address)
  // ===========================================================================
  if (!purchasePriceEur) {
    const priceEl =
      document.querySelector(".is24qa-kaufpreis-main") ||
      document.querySelector("[data-qa='kaufpreis']") ||
      document.querySelector(".is24qa-kaufpreis") ||
      document.querySelector(".hardfacts__cell--price");
    purchasePriceEur = parseNum(priceEl?.textContent);
  }

  if (!livingAreaSqm) {
    const areaEl =
      document.querySelector(".is24qa-wohnflaeche-ca") ||
      document.querySelector("[data-qa='wohnflaeche']") ||
      document.querySelector(".is24qa-flaeche") ||
      document.querySelector(".hardfacts__cell--area");
    livingAreaSqm = parseNum(areaEl?.textContent);
  }

  if (!rooms) {
    const roomsEl =
      document.querySelector(".is24qa-zi") ||
      document.querySelector("[data-qa='zimmer']") ||
      document.querySelector(".is24qa-zimmer") ||
      document.querySelector(".hardfacts__cell--rooms");
    rooms = parseNum(roomsEl?.textContent);
  }

  if (!bedrooms) {
    const bedEl =
      document.querySelector(".is24qa-schlafzimmer") ||
      document.querySelector("[data-qa='schlafzimmer']");
    bedrooms = parseNum(bedEl?.textContent);
  }

  if (!bathrooms) {
    const bathEl =
      document.querySelector(".is24qa-badezimmer") ||
      document.querySelector("[data-qa='badezimmer']");
    bathrooms = parseNum(bathEl?.textContent);
  }

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
      const bodyTop = document.body.innerText.slice(0, 3000);
      const m = bodyTop.match(/\b(\d{5})\s+([A-ZÄÖÜ][a-zäöüß\s\-]+)/);
      if (m) {
        zip = m[1];
        city = m[2]?.trim();
        fullAddress = `${zip} ${city}`;
      }
    }
  }

  // ===========================================================================
  // TIER 4: DOM Key-Value Scanner (Energy, Year, Hausgeld, Courtage)
  // ===========================================================================
  const scanDomKeyValuePairs = () => {
    // 0. Direct data-qa & is24qa selectors for energy
    if (!energyClass) {
      const el = document.querySelector(".is24qa-energieeffizienzklasse, [data-qa='energieeffizienzklasse'], [data-qa='energy-efficiency-class']");
      const m = el?.textContent?.match(/[A-H]\+?/i);
      if (m) energyClass = m[0].toUpperCase();
    }
    if (!energyValKwh) {
      const el = document.querySelector(".is24qa-endenergiebedarf, .is24qa-endenergieverbrauch, .is24qa-energieverbrauchskennwert, [data-qa='energy-consumption-value'], [data-qa='endenergiebedarf'], [data-qa='endenergieverbrauch']");
      if (el?.textContent) energyValKwh = parseNum(el.textContent);
    }
    if (!energyCertificateType) {
      const el = document.querySelector(".is24qa-energieausweistyp, .is24qa-art-des-energieausweises, [data-qa='energy-certificate-type'], [data-qa='energieausweis']");
      if (el?.textContent?.trim()) energyCertificateType = el.textContent.trim();
    }
    if (!primaryEnergySource) {
      const el = document.querySelector(".is24qa-wesentliche-energietraeger, .is24qa-befeuerung, [data-qa='firing-type'], [data-qa='energietraeger']");
      if (el?.textContent?.trim()) primaryEnergySource = el.textContent.trim();
    }
    if (!heatingType) {
      const el = document.querySelector(".is24qa-heizungsart, [data-qa='heating-type']");
      if (el?.textContent?.trim()) heatingType = el.textContent.trim();
    }

    // Scan dt / dd pairs
    document.querySelectorAll("dt").forEach((dt) => {
      const label = dt.textContent?.trim().toLowerCase() || "";
      const dd = dt.nextElementSibling;
      const value = dd?.textContent?.trim() || "";

      if (!energyCertificateType && (label.includes("energieausweis") || label.includes("ausweistyp"))) {
        energyCertificateType = value;
      }
      if (!energyClass && label.includes("energieeffizienzklasse")) {
        const m = value.match(/[A-H]\+?/i);
        if (m) energyClass = m[0].toUpperCase();
      }
      if (!energyValKwh && (label.includes("endenergie") || label.includes("energiebedarf") || label.includes("energieverbrauch"))) {
        energyValKwh = parseNum(value);
      }
      if (!primaryEnergySource && (label.includes("energieträger") || label.includes("wesentliche"))) {
        primaryEnergySource = value;
      }
      if (!heatingType && (label.includes("heizungsart") || label.includes("heizsystem"))) {
        heatingType = value;
      }
      if (!constructionYear && label.includes("baujahr")) {
        const y = parseNum(value);
        if (y && y >= 1700 && y <= 2035) constructionYear = Math.round(y);
      }
      if (!bedrooms && (label.includes("schlafzimmer") || label.includes("schlafzi"))) {
        bedrooms = parseNum(value);
      }
      if (!bathrooms && (label.includes("badezimmer") || label.includes("badezi") || label === "bad")) {
        bathrooms = parseNum(value);
      }
      if (!monthlyHausgeld && (label.includes("hausgeld") || label.includes("wohngeld"))) {
        monthlyHausgeld = parseNum(value);
      }
      if (!brokerCommission && (label.includes("provision") || label.includes("courtage"))) {
        brokerCommission = parseNum(value);
      }
    });

    // Scan custom grid items
    document.querySelectorAll("div, li").forEach((container) => {
      const text = container.textContent || "";
      if (text.length > 300) return;

      if (!energyClass && text.includes("Energieeffizienzklasse")) {
        const m = text.match(/Energieeffizienzklasse[:\s]+([A-H]\+?)/i);
        if (m) energyClass = m[1].toUpperCase();
      }
      if (!energyValKwh && (text.includes("Endenergie") || text.includes("Energiebedarf") || text.includes("Energieverbrauch"))) {
        const m = text.match(/([0-9,\.]+)\s*kWh/i);
        if (m) energyValKwh = parseNum(m[1]);
      }
      if (!primaryEnergySource && (text.includes("Energieträger") || text.includes("Befeuerung"))) {
        const m = text.match(/(?:Energieträger|Befeuerung)[:\s]+([A-Za-zäöüÄÖÜ\s,]+?)(?:\n|\r|\t|Heizung|Endenergie|Baujahr|$)/);
        if (m && m[1].trim().length > 1) primaryEnergySource = m[1].trim();
      }
      if (!heatingType && (text.includes("Heizungsart") || text.includes("Heizung:"))) {
        const m = text.match(/(?:Heizungsart|Heizung)[:\s]+([A-Za-zäöüÄÖÜ\s,]+?)(?:\n|\r|\t|Energieträger|Endenergie|$)/);
        if (m && m[1].trim().length > 1) heatingType = m[1].trim();
      }
      if (!energyCertificateType && text.includes("Energieausweis")) {
        if (text.includes("Bedarfsausweis")) energyCertificateType = "Bedarfsausweis";
        else if (text.includes("Verbrauchsausweis")) energyCertificateType = "Verbrauchsausweis";
        else if (text.includes("liegt zur Besichtigung vor")) energyCertificateType = "liegt zur Besichtigung vor";
        else if (text.includes("nicht erforderlich") || text.includes("Denkmalschutz") || text.includes("Ensembleschutz")) {
          energyCertificateType = "nicht erforderlich (Denkmalschutz)";
        }
      }
    });
  };

  scanDomKeyValuePairs();

  // ===========================================================================
  // TIER 5: Full Page Body Scanner (Safety Net)
  // ===========================================================================
  const bodyText = document.body.innerText || "";

  // 1. Fallback for Price from body
  if (!purchasePriceEur) {
    const priceMatch = bodyText.match(/(?:Kaufpreis|Preis)[:\s]+([0-9\.\,]+)\s*€/i);
    if (priceMatch) purchasePriceEur = parseNum(priceMatch[1]);
  }

  // 2. Fallback for Living Area from body
  if (!livingAreaSqm) {
    const areaMatch = bodyText.match(/(?:Wohnfläche|Wohnfl\.)[:\s]+([0-9\.\,]+)\s*m²/i);
    if (areaMatch) livingAreaSqm = parseNum(areaMatch[1]);
  }

  // 3. Fallback for Rooms from body
  if (!rooms) {
    const roomsMatch = bodyText.match(/(?:Zimmer|Zi\.)[:\s]+([0-9\.\,]+)/i);
    if (roomsMatch) rooms = parseNum(roomsMatch[1]);
  }

  // 3b. Fallback for Bedrooms & Bathrooms from body
  if (!bedrooms) {
    const bedMatch = bodyText.match(/(?:Schlafzimmer|Schlafzi\.)[:\s]+([0-9]+)/i);
    if (bedMatch) bedrooms = parseNum(bedMatch[1]);
  }
  if (!bathrooms) {
    const bathMatch = bodyText.match(/(?:Badezimmer|Bäder|Bad)[:\s]+([0-9]+)/i);
    if (bathMatch) bathrooms = parseNum(bathMatch[1]);
  }

  // 4. Check for Denkmalschutz exemption if no certificate found
  if (!energyCertificateType) {
    if (bodyText.includes("Denkmalschutz") || bodyText.includes("Baudenkmal") || bodyText.includes("Ensembleschutz")) {
      energyCertificateType = "nicht erforderlich (Denkmalschutz)";
      if (!energyClass) energyClass = "Denkmal";
    }
  }

  // 5. Full text regex for energy class
  if (!energyClass) {
    const classMatch = bodyText.match(/Energieeffizienzklasse[:\s]+([A-H]\+?)\b/i);
    if (classMatch) energyClass = classMatch[1].toUpperCase();
  }

  // 6. Full text regex for kWh value
  if (!energyValKwh) {
    const kwhMatch = bodyText.match(/(?:Endenergiebedarf|Endenergieverbrauch|Energiebedarf|Energieverbrauch)[:\s]+([0-9,\.]+)\s*kWh/i);
    if (kwhMatch) energyValKwh = parseNum(kwhMatch[1]);
  }

  // 7. Full text regex for Energieträger
  if (!primaryEnergySource) {
    const energyKeywords = ["Gas", "Erdgas", "Öl", "Heizöl", "Fernwärme", "Pellets", "Holzpellets", "Wärmepumpe", "Luft-Wasser-Wärmepumpe", "Solar", "Strom"];
    const foundSources: string[] = [];
    energyKeywords.forEach((kw) => {
      const re = new RegExp(`(?:Wesentliche[r]?\\s+Energieträger|Befeuerung)[^\\n]{0,50}\\b${kw}\\b`, "i");
      if (re.test(bodyText) && !foundSources.includes(kw)) {
        foundSources.push(kw);
      }
    });
    if (foundSources.length > 0) {
      primaryEnergySource = foundSources.join(", ");
    }
  }

  // 8. Full text regex for Heizungsart
  if (!heatingType) {
    const heatingKeywords = ["Zentralheizung", "Etagenheizung", "Fußbodenheizung", "Fernwärme", "Wärmepumpe", "Ofenheizung", "Gasetagenheizung"];
    for (const hk of heatingKeywords) {
      const re = new RegExp(`(?:Heizungsart|Heizung)[^\\n]{0,50}\\b${hk}\\b`, "i");
      if (re.test(bodyText)) {
        heatingType = hk;
        break;
      }
    }
    // Global fallback across full text if not found next to keyword
    if (!heatingType) {
      if (/Fußbodenheizung/i.test(bodyText)) heatingType = "Fußbodenheizung";
      else if (/Etagenheizung|Gasetagenheizung/i.test(bodyText)) heatingType = "Etagenheizung";
      else if (/Zentralheizung|Öl-Zentralheizung|Gas-Zentralheizung/i.test(bodyText)) heatingType = "Zentralheizung";
      else if (/Fernwärme/i.test(bodyText)) heatingType = "Fernwärme";
      else if (/Wärmepumpe/i.test(bodyText)) heatingType = "Wärmepumpe";
      else if (/Ofenheizung/i.test(bodyText)) heatingType = "Ofenheizung";
      else if (primaryEnergySource === "Öl" || primaryEnergySource?.includes("Öl") || /Ölheizung/i.test(bodyText)) {
        heatingType = "Zentralheizung";
      }
    }
  }

  // 9. EnEV/GEG Standard Mapping: Infer energy class from kWh if missing
  if (!energyClass && energyValKwh && energyValKwh > 0) {
    if (energyValKwh <= 30) energyClass = "A+";
    else if (energyValKwh <= 50) energyClass = "A";
    else if (energyValKwh <= 75) energyClass = "B";
    else if (energyValKwh <= 100) energyClass = "C";
    else if (energyValKwh <= 130) energyClass = "D";
    else if (energyValKwh <= 160) energyClass = "E";
    else if (energyValKwh <= 200) energyClass = "F";
    else if (energyValKwh <= 250) energyClass = "G";
    else energyClass = "H";
  }

  // ===========================================================================
  // TIER 6: Comprehensive Image Crawler (OpenGraph + All ImmoScout CDN Photos)
  // ===========================================================================
  // 1. OpenGraph Cover Image
  const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute("content");
  if (ogImage && !imageUrls.includes(ogImage)) {
    imageUrls.unshift(ogImage);
  }

  // 2. Scan all img elements across the page for pictures.immobilienscout24.de
  if (imageUrls.length < 5) {
    document.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
      const src = img.src || img.getAttribute("data-src") || img.getAttribute("srcset");
      if (src && (src.includes("pictures.immobilienscout24.de") || src.includes("is24"))) {
        let best = src;
        if (src.includes(",")) {
          const parts = src.split(",");
          best = parts[parts.length - 1].trim().split(" ")[0];
        }
        if (
          best.startsWith("http") &&
          !imageUrls.includes(best) &&
          !best.includes("icon") &&
          !best.includes("logo") &&
          !best.includes("badge")
        ) {
          // Normalize to high-res if downscaled thumbnail
          const highRes = best.replace(/\/resize\/[0-9]+x[0-9]+%3E\//, "/resize/1106x830%3E/");
          imageUrls.push(highRes);
        }
      }
    });
  }

  // 3. Broker Company fallback
  if (!brokerCompany) {
    brokerCompany =
      document.querySelector(".offerer-name")?.textContent?.trim() ||
      document.querySelector("[data-qa='company-name']")?.textContent?.trim() ||
      document.querySelector("[data-qa='contact-name']")?.textContent?.trim();
  }

  // Clean numericals
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
      bedrooms,
      bathrooms,
      construction_year: constructionYear,
      energy_class: energyClass,
      energy_val_kwh: energyValKwh,
      energy_certificate_type: energyCertificateType,
      primary_energy_source: primaryEnergySource,
      heating_type: heatingType
    },
    contact: {
      broker_company: brokerCompany,
      broker_name: brokerName
    },
    media: {
      cover_image_url: imageUrls[0],
      image_urls: imageUrls.slice(0, 25)
    },
    description: (() => {
      if (description && description.trim().length > 50) return description;
      const domTexts = [
        document.querySelector(".is24qa-objektbeschreibung, [data-qa='descriptionNote'], [data-qa='objektbeschreibung']")?.textContent?.trim(),
        document.querySelector(".is24qa-ausstattung, [data-qa='furnishingNote'], [data-qa='ausstattung']")?.textContent?.trim(),
        document.querySelector(".is24qa-lage, [data-qa='locationNote'], [data-qa='lage']")?.textContent?.trim(),
        document.querySelector(".is24qa-sonstiges, [data-qa='otherNote'], [data-qa='sonstiges']")?.textContent?.trim(),
      ].filter(Boolean);
      return domTexts.length > 0 ? domTexts.join("\n\n") : description;
    })(),
    extracted_at: new Date().toISOString()
  };
}
