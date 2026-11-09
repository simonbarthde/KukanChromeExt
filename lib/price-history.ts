import { Storage } from "@plasmohq/storage";

const storage = new Storage();

export interface PricePoint {
  date: string;
  priceEur: number;
  changeEur?: number;
  changePct?: number;
}

export interface PriceHistoryInfo {
  currentPriceEur: number;
  initialPriceEur: number;
  totalChangeEur: number;
  totalChangePct: number;
  firstSeenDate: string;
  daysOnMarket: number;
  history: PricePoint[];
}

/**
 * Extracts creation date or price history directly from portal DOM / scripts
 */
export function extractPortalMetadata(): { creationDate?: string; originalPrice?: number } {
  // 1. Check __NEXT_DATA__ (ImmoScout24 & Immowelt)
  try {
    const nextDataEl = document.getElementById("__NEXT_DATA__");
    if (nextDataEl?.textContent) {
      const data = JSON.parse(nextDataEl.textContent);
      const expose = data?.props?.pageProps?.expose || data?.props?.pageProps?.initialState?.expose;
      if (expose) {
        const creation =
          expose.creationDate ||
          expose.firstActivationDate ||
          expose.realEstate?.creationDate ||
          expose.onlineSince;

        const origPrice = expose.originalPrice || expose.priceHistory?.[0]?.price;
        return { creationDate: creation, originalPrice: origPrice };
      }
    }
  } catch (err) {
    // Ignore JSON parse errors
  }

  // 2. Check JSON-LD
  try {
    const jsonLdEls = document.querySelectorAll('script[type="application/ld+json"]');
    for (const el of Array.from(jsonLdEls)) {
      if (el.textContent) {
        const parsed = JSON.parse(el.textContent);
        if (parsed.datePosted) {
          return { creationDate: parsed.datePosted };
        }
      }
    }
  } catch (err) {
    // Ignore
  }

  // 3. Check Kleinanzeigen Date element
  const adDetails = document.querySelector("#viewad-extra-info");
  if (adDetails?.textContent) {
    const match = adDetails.textContent.match(/(\d{2}\.\d{2}\.\d{4})/);
    if (match) {
      const [_, d] = match;
      const parts = d.split(".");
      const iso = `${parts[2]}-${parts[1]}-${parts[0]}`;
      return { creationDate: iso };
    }
  }

  return {};
}

/**
 * Records or retrieves price history for a given portal external_id
 */
export async function getOrRecordPriceHistory(
  portal: string,
  externalId: string,
  currentPriceEur: number
): Promise<PriceHistoryInfo> {
  const key = `price_history_${portal}_${externalId}`;
  const stored = (await storage.get<PricePoint[]>(key)) || [];

  const meta = extractPortalMetadata();
  const todayStr = new Date().toISOString().split("T")[0];

  let history: PricePoint[] = stored.length > 0 ? stored : [];

  // If no stored history yet, initialize with creation date / current price
  if (history.length === 0) {
    if (meta.creationDate) {
      const createdDateStr = meta.creationDate.split("T")[0];
      const origPrice = meta.originalPrice || currentPriceEur;

      if (createdDateStr < todayStr && origPrice !== currentPriceEur) {
        history.push({
          date: createdDateStr,
          priceEur: origPrice
        });
      }
    }

    history.push({
      date: todayStr,
      priceEur: currentPriceEur
    });

    await storage.set(key, history);
  } else {
    // Check if price changed or if today is already logged
    const lastEntry = history[history.length - 1];
    if (lastEntry.priceEur !== currentPriceEur) {
      history.push({
        date: todayStr,
        priceEur: currentPriceEur
      });
      await storage.set(key, history);
    }
  }

  // Calculate days on market
  const firstDateStr = meta.creationDate ? meta.creationDate.split("T")[0] : history[0].date;
  const firstDate = new Date(firstDateStr);
  const now = new Date();
  const diffDays = Math.max(1, Math.round((now.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));

  // Calculate percentage changes
  const initialPrice = history[0].priceEur;
  const enrichedHistory: PricePoint[] = history.map((point, index) => {
    if (index === 0) return { ...point };
    const prev = history[index - 1];
    const diff = point.priceEur - prev.priceEur;
    const diffPct = (diff / prev.priceEur) * 100;
    return {
      ...point,
      changeEur: diff,
      changePct: Math.round(diffPct * 10) / 10
    };
  });

  const totalChangeEur = currentPriceEur - initialPrice;
  const totalChangePct = initialPrice > 0 ? Math.round((totalChangeEur / initialPrice) * 1000) / 10 : 0;

  return {
    currentPriceEur,
    initialPriceEur: initialPrice,
    totalChangeEur,
    totalChangePct,
    firstSeenDate: firstDateStr,
    daysOnMarket: diffDays,
    history: enrichedHistory
  };
}
