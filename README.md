# FlipOS – Deal Sourcing Radar (Chrome Extension)

Manifest V3 Browser-Extension für **FlipOS** zur automatisierten 1-Klick-Erfassung von Immobilieninseraten auf **ImmoScout24**, **Immowelt** und **Kleinanzeigen** direkt in die Universal Staging Inbox (`deal_import_staging`).

---

## Features

1. **Zero-Bot Bypass:**
   - Läuft direkt im authentifizierten Browser des Nutzers. Cloudflare- & DataDome-Sperren greifen nicht.
2. **1-Klick Deal-Clipper:**
   - Automatische Extraktion von Kaufpreis, Wohnfläche, Zimmeranzahl, Baujahr, Energieklasse, Adresse/PLZ, Exposé-Bildern und Maklerkontakten.
3. **In-Page Radar-Widget ("Rote Kapsel"):**
   - Floating-Widget auf Inseratsseiten mit Live-Duplikatsprüfung (`deal_import_staging`).
   - Kapsel zeigt auf einen Blick, ob das Inserat bereits im FlipOS-Workspace erfasst ist.
4. **Supabase Auth Integration:**
   - Direkte Anmeldung mit den FlipOS-Zugangsdaten (E-Mail & Passwort).
   - Automatische Auflösung von `company_id` und Workspace über `public.current_company_id()`.
   - Sichere Persistenz des JWT-Tokens in isoliertem Extension-Storage (`@plasmohq/storage`).

---

## Schnelleinstieg / Lokale Entwicklung

### 1. Abhängigkeiten installieren

```bash
pnpm install
```

### 2. Entwicklungsmodus starten

```bash
pnpm dev
```

### 3. In Google Chrome laden

1. Öffne Google Chrome und navigiere zu `chrome://extensions/`.
2. Aktiviere oben rechts den **Entwicklermodus** (*Developer mode*).
3. Klicke auf **Entpackte Erweiterung laden** (*Load unpacked*).
4. Wähle den Ordner `build/chrome-mv3-dev` (bei `pnpm dev`) bzw. `build/chrome-mv3-prod` (bei `pnpm build`) aus.

---

## Produktions-Build

```bash
pnpm build
```

Das fertige Paket für den Chrome Web Store oder zur manuellen Installation befindet sich im Ordner `build/chrome-mv3-prod`.

---

## Unterstützte Portale

- **ImmobilienScout24:** `https://www.immobilienscout24.de/expose/*`
- **Kleinanzeigen:** `https://www.kleinanzeigen.de/s-anzeige/*`
- **Immowelt:** `https://www.immowelt.de/expose/*`
