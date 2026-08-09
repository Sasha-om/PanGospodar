/**
 * Nova Poshta API client (server-only).
 *
 * Kept on the server so `NOVA_POSHTA_API_KEY` is never shipped to the browser;
 * the checkout form talks to our own /api/nova-poshta/* routes instead.
 *
 * Every function degrades to an empty list instead of throwing — a delivery
 * lookup failing must never block checkout.
 */

const API_URL = "https://api.novaposhta.ua/v2.0/json/";

export interface NpCity {
  /** Settlement ref used to look up warehouses. */
  ref: string;
  /** "Ратне" */
  name: string;
  /** "Ратнівський р-н, Волинська обл." */
  area: string;
}

export interface NpWarehouse {
  ref: string;
  /** "Відділення №1: вул. Центральна, 74" */
  description: string;
  number: string;
}

export function hasNovaPoshtaKey(): boolean {
  return Boolean(process.env.NOVA_POSHTA_API_KEY?.trim());
}

async function call<T>(
  modelName: string,
  calledMethod: string,
  methodProperties: Record<string, unknown>,
): Promise<T[]> {
  const apiKey = process.env.NOVA_POSHTA_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[nova-poshta] NOVA_POSHTA_API_KEY is not set");
    return [];
  }

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey,
        modelName,
        calledMethod,
        methodProperties,
      }),
      // Delivery data changes rarely; a short cache keeps typing snappy.
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      console.error(`[nova-poshta] HTTP ${response.status} for ${calledMethod}`);
      return [];
    }

    const data = (await response.json()) as {
      success: boolean;
      data: T[];
      errors?: string[];
    };

    if (!data.success) {
      console.error(
        `[nova-poshta] ${calledMethod} failed: ${(data.errors ?? []).join("; ")}`,
      );
      return [];
    }
    return data.data ?? [];
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    console.error(`[nova-poshta] ${calledMethod} threw: ${message}`);
    return [];
  }
}

interface RawSettlementAddress {
  Ref?: string;
  DeliveryCity?: string;
  MainDescription?: string;
  Area?: string;
  Region?: string;
  SettlementTypeCode?: string;
  Present?: string;
}

/** Autocomplete settlements by a partial name. */
export async function searchCities(query: string): Promise<NpCity[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }

  const results = await call<{ Addresses?: RawSettlementAddress[] }>(
    "Address",
    "searchSettlements",
    { CityName: trimmed, Limit: 20 },
  );

  const addresses = results[0]?.Addresses ?? [];
  return addresses
    .filter((entry) => entry.DeliveryCity || entry.Ref)
    .map((entry) => {
      const area = [entry.Area, entry.Region]
        .filter((part) => part && part.trim())
        .join(", ");
      return {
        // DeliveryCity is the ref that getWarehouses expects.
        ref: (entry.DeliveryCity || entry.Ref) as string,
        name: entry.MainDescription ?? entry.Present ?? "",
        area,
      };
    })
    .filter((city) => city.ref && city.name);
}

interface RawWarehouse {
  Ref?: string;
  Description?: string;
  Number?: string;
}

/** Warehouses/branches for a settlement ref. */
export async function getWarehouses(cityRef: string): Promise<NpWarehouse[]> {
  const ref = cityRef.trim();
  if (!ref) {
    return [];
  }

  const results = await call<RawWarehouse>("Address", "getWarehouses", {
    CityRef: ref,
    Limit: 500,
  });

  return results
    .filter((entry) => entry.Ref && entry.Description)
    .map((entry) => ({
      ref: entry.Ref as string,
      description: entry.Description as string,
      number: entry.Number ?? "",
    }))
    .sort((a, b) => {
      // "Відділення №2" should come before "№10" — numeric where possible.
      const na = Number(a.number);
      const nb = Number(b.number);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return a.description.localeCompare(b.description, "uk");
    });
}
