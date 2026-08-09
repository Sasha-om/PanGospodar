"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { useDebouncedValue } from "@/lib/use-debounced-value";

interface NpCity {
  ref: string;
  name: string;
  area: string;
}

interface NpWarehouse {
  ref: string;
  description: string;
  number: string;
}

const fieldClass =
  "w-full rounded-sm border border-stone-300 px-3 py-2 text-sm text-stone-800 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/40";

/**
 * City autocomplete + dependent warehouse dropdown, both backed by the Nova
 * Poshta API through our own server routes (the API key stays server-side).
 *
 * Submits two hidden fields: `city` (human readable) and `warehouse`.
 */
export default function NovaPoshtaPicker({
  cityError,
  warehouseError,
}: {
  cityError?: string;
  warehouseError?: string;
}) {
  const [cityInput, setCityInput] = useState("");
  const [selectedCity, setSelectedCity] = useState<NpCity | null>(null);
  const [suggestions, setSuggestions] = useState<NpCity[]>([]);
  const [open, setOpen] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);

  const [warehouses, setWarehouses] = useState<NpWarehouse[]>([]);
  const [warehouse, setWarehouse] = useState("");
  const [loadingWarehouses, setLoadingWarehouses] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const boxRef = useRef<HTMLDivElement>(null);
  const debouncedCity = useDebouncedValue(cityInput, 350);

  // Close the suggestion list on an outside click.
  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  // Search settlements once typing pauses. Too-short terms are filtered when
  // rendering rather than by clearing state here.
  useEffect(() => {
    const term = debouncedCity.trim();
    if (term.length < 2 || selectedCity?.name === term) {
      return;
    }

    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingCities(true);

    fetch(`/api/nova-poshta/cities?q=${encodeURIComponent(term)}`, {
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((data: { cities: NpCity[]; configured: boolean }) => {
        setSuggestions(data.cities ?? []);
        setUnavailable(!data.configured);
        setOpen(true);
      })
      .catch((caught: unknown) => {
        if ((caught as Error)?.name !== "AbortError") {
          console.error("[np] city search failed:", caught);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingCities(false);
      });

    return () => controller.abort();
  }, [debouncedCity, selectedCity]);

  // Load branches whenever a city is chosen. Clearing on deselect happens in
  // the input handler instead — that is an event, not a synchronization.
  useEffect(() => {
    if (!selectedCity) {
      return;
    }

    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingWarehouses(true);

    fetch(
      `/api/nova-poshta/warehouses?cityRef=${encodeURIComponent(selectedCity.ref)}`,
      { signal: controller.signal },
    )
      .then((response) => response.json())
      .then((data: { warehouses: NpWarehouse[] }) => {
        setWarehouses(data.warehouses ?? []);
      })
      .catch((caught: unknown) => {
        if ((caught as Error)?.name !== "AbortError") {
          console.error("[np] warehouses failed:", caught);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingWarehouses(false);
      });

    return () => controller.abort();
  }, [selectedCity]);

  function chooseCity(city: NpCity) {
    setSelectedCity(city);
    setCityInput(city.name);
    setOpen(false);
    setSuggestions([]);
    // A new city means the previous branch no longer applies.
    setWarehouses([]);
    setWarehouse("");
  }

  const cityValue = selectedCity
    ? [selectedCity.name, selectedCity.area].filter(Boolean).join(", ")
    : "";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {/* The values actually submitted with the form. */}
      <input type="hidden" name="city" value={cityValue} />
      <input type="hidden" name="warehouse" value={warehouse} />

      <div className="relative flex flex-col gap-1.5" ref={boxRef}>
        <label htmlFor="np-city" className="text-sm font-semibold text-stone-700">
          Місто <span className="text-accent-600">*</span>
        </label>
        <div className="relative">
          <MapPin
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
            aria-hidden="true"
          />
          <input
            id="np-city"
            type="text"
            autoComplete="off"
            value={cityInput}
            onChange={(event) => {
              setCityInput(event.target.value);
              // Editing the city invalidates the branch selection.
              setSelectedCity(null);
              setWarehouses([]);
              setWarehouse("");
            }}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            placeholder="Почніть вводити назву міста"
            aria-expanded={open}
            aria-autocomplete="list"
            role="combobox"
            aria-controls="np-city-list"
            className={`${fieldClass} pl-9 pr-9`}
          />
          {loadingCities ? (
            <Loader2
              className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-accent-500"
              aria-hidden="true"
            />
          ) : null}
        </div>

        {open && cityInput.trim().length >= 2 && suggestions.length > 0 ? (
          <ul
            id="np-city-list"
            role="listbox"
            className="absolute top-full z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-sm border border-stone-200 bg-white shadow-lg"
          >
            {suggestions.map((city) => (
              <li key={city.ref}>
                <button
                  type="button"
                  onClick={() => chooseCity(city)}
                  className="block w-full px-3 py-2 text-left text-sm text-stone-800 transition-colors hover:bg-accent-50"
                >
                  {city.name}
                  {city.area ? (
                    <span className="block text-xs text-stone-500">
                      {city.area}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {unavailable ? (
          <p className="text-xs text-amber-700">
            Довідник Нової Пошти недоступний — вкажіть місто й відділення у
            коментарі до замовлення.
          </p>
        ) : null}
        {cityError ? (
          <p className="text-xs font-medium text-red-600">{cityError}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="np-warehouse"
          className="text-sm font-semibold text-stone-700"
        >
          Відділення <span className="text-accent-600">*</span>
        </label>
        <select
          id="np-warehouse"
          value={warehouse}
          onChange={(event) => setWarehouse(event.target.value)}
          disabled={!selectedCity || loadingWarehouses}
          className={`${fieldClass} bg-white disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400`}
        >
          <option value="">
            {!selectedCity
              ? "Спочатку оберіть місто"
              : loadingWarehouses
                ? "Завантаження відділень…"
                : warehouses.length === 0
                  ? "Відділень не знайдено"
                  : "Оберіть відділення"}
          </option>
          {warehouses.map((item) => (
            <option key={item.ref} value={item.description}>
              {item.description}
            </option>
          ))}
        </select>
        {warehouseError ? (
          <p className="text-xs font-medium text-red-600">{warehouseError}</p>
        ) : null}
      </div>
    </div>
  );
}
