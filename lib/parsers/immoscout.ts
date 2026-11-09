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

  let title =
    document.querySelector("#expose-title")?.textContent?.trim() ||
    document.querySelector("h1")?.textContent?.trim() ||
    document.title;

  let purchasePriceEur: number | undefined;
  let livingAreaSqm: number | undefined;
  let rooms: number | undefined;
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
  // TIER 1: Next.js __NEXT_DATA__
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

        // Energy Certificate from realEstate fields
        const ec = re.energyCertificate || expose.energyCertificate;
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

        // Check attributes/sections arrays in expose
        const sections = expose.sections || expose.criteria || [];
        if (Array.isArray(sections)) {
          sections.forEach((sec: any) => {
            const items = sec.attributes || sec.items || (sec.label && sec.value ? [sec] : []);
            if (Array.isArray(items)) {
              items.forEach((item: any) => {
                const l = String(item.label || item.key || "").toLowerCase();
                const v = String(item.value || "");
                if (!energyCertificateType && l.includes("energieausweis")) energyCertificateType = v;
                if (!energyClass && l.includes("energieeffizienz")) {
                  const m = v.match(/[A-H]\+?/i);
                  if (m) energyClass = m[0].toUpperCase();
                }
                if (!energyValKwh && (l.includes("endenergie") || l.includes("energiebedarf") || l.includes("energieverbrauch"))) {
                  energyValKwh = parseNum(v);
                }
                if (!primaryEnergySource && (l.includes("energieträger") || l.includes("befeuerung"))) {
                  primaryEnergySource = v;
                }
                if (!heatingType && l.includes("heizung")) {
                  heatingType = v;
                }
              });
            }
          });
        }
      }
    }
  } catch (err) {
    console.warn("[immoscout parser] Next.js __NEXT_DATA__ extraction error:", err);
  }

  // ===========================================================================
  // TIER 2: Deep DOM Key-Value Scanner
  // ===========================================================================
  const scanDomKeyValuePairs = () => {
    // 0. Direct data-qa & is24qa class selectors
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
      if (!monthlyHausgeld && (label.includes("hausgeld") || label.includes("wohngeld"))) {
        monthlyHausgeld = parseNum(value);
      }
      if (!brokerCommission && (label.includes("provision") || label.includes("courtage"))) {
        brokerCommission = parseNum(value);
      }
    });

    // Scan custom grid items (e.g. .criteria-item, .grid-item, div with label and value children)
    document.querySelectorAll("div, li").forEach((container) => {
      const text = container.textContent || "";
      if (text.length > 300) return; // Skip large wrappers

      // Look for energy class
      if (!energyClass && text.includes("Energieeffizienzklasse")) {
        const m = text.match(/Energieeffizienzklasse[:\s]+([A-H]\+?)/i);
        if (m) energyClass = m[1].toUpperCase();
      }
      // Look for kWh
      if (!energyValKwh && (text.includes("Endenergie") || text.includes("Energiebedarf") || text.includes("Energieverbrauch"))) {
        const m = text.match(/([0-9,\.]+)\s*kWh/i);
        if (m) energyValKwh = parseNum(m[1]);
      }
      // Look for Energieträger
      if (!primaryEnergySource && (text.includes("Energieträger") || text.includes("Befeuerung"))) {
        const m = text.match(/(?:Energieträger|Befeuerung)[:\s]+([A-Za-zäöüÄÖÜ\s,]+?)(?:\n|\r|\t|Heizung|Endenergie|Baujahr|$)/);
        if (m && m[1].trim().length > 1) primaryEnergySource = m[1].trim();
      }
      // Look for Heizungsart
      if (!heatingType && (text.includes("Heizungsart") || text.includes("Heizung:"))) {
        const m = text.match(/(?:Heizungsart|Heizung)[:\s]+([A-Za-zäöüÄÖÜ\s,]+?)(?:\n|\r|\t|Energieträger|Endenergie|$)/);
        if (m && m[1].trim().length > 1) heatingType = m[1].trim();
      }
      // Look for Energieausweistyp
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
  // TIER 3: Full Page Body Regex Scanner (Safety Net)
  // ===========================================================================
  const bodyText = document.body.innerText || "";

  // 1. Check for Denkmalschutz exemption if no certificate found
  if (!energyCertificateType) {
    if (bodyText.includes("Denkmalschutz") || bodyText.includes("Baudenkmal") || bodyText.includes("Ensembleschutz")) {
      energyCertificateType = "nicht erforderlich (Denkmalschutz)";
      if (!energyClass) energyClass = "Denkmal";
    }
  }

  // 2. Full text regex for energy class
  if (!energyClass) {
    const classMatch = bodyText.match(/Energieeffizienzklasse[:\s]+([A-H]\+?)\b/i);
    if (classMatch) energyClass = classMatch[1].toUpperCase();
  }

  // 3. Full text regex for kWh value
  if (!energyValKwh) {
    const kwhMatch = bodyText.match(/(?:Endenergiebedarf|Endenergieverbrauch|Energiebedarf|Energieverbrauch)[:\s]+([0-9,\.]+)\s*kWh/i);
    if (kwhMatch) energyValKwh = parseNum(kwhMatch[1]);
  }

  // 4. Full text regex for Energieträger
  if (!primaryEnergySource) {
    const energyKeywords = ["Gas", "Erdgas", "Öl", "Heizöl", "Fernwärme", "Pellets", "Holzpellets", "Wärmepumpe", "Luft-Wasser-Wärmepumpe", "Solar", "Strom"];
    const foundSources: string[] = [];
    energyKeywords.forEach((kw) => {
      // Look for "Wesentliche Energieträger: Gas" or similar
      const re = new RegExp(`(?:Wesentliche[r]?\\s+Energieträger|Befeuerung)[^\\n]{0,50}\\b${kw}\\b`, "i");
      if (re.test(bodyText) && !foundSources.includes(kw)) {
        foundSources.push(kw);
      }
    });
    if (foundSources.length > 0) {
      primaryEnergySource = foundSources.join(", ");
    }
  }

  // 5. Full text regex for Heizungsart
  if (!heatingType) {
    const heatingKeywords = ["Zentralheizung", "Etagenheizung", "Fußbodenheizung", "Fernwärme", "Wärmepumpe", "Ofenheizung", "Gasetagenheizung"];
    for (const hk of heatingKeywords) {
      const re = new RegExp(`(?:Heizungsart|Heizung)[^\\n]{0,50}\\b${hk}\\b`, "i");
      if (re.test(bodyText)) {
        heatingType = hk;
        break;
      }
    }
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
      image_urls: imageUrls.slice(0, 20)
    },
    description: description || document.querySelector(".is24qa-objektbeschreibung")?.textContent?.trim(),
    extracted_at: new Date().toISOString()
  };
}
