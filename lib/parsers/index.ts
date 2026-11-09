import type { ExtractedDealPayload } from "../../types";
import { parseImmoScout } from "./immoscout";
import { parseKleinanzeigen } from "./kleinanzeigen";
import { parseImmowelt } from "./immowelt";

export function extractDealFromCurrentPage(): ExtractedDealPayload | null {
  const url = window.location.href;

  if (url.includes("immobilienscout24.de")) {
    return parseImmoScout();
  }
  if (url.includes("kleinanzeigen.de")) {
    return parseKleinanzeigen();
  }
  if (url.includes("immowelt.de")) {
    return parseImmowelt();
  }

  return null;
}
