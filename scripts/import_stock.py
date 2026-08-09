#!/usr/bin/env python3
"""
Надсилає товари на сайт: POST /api/import-stock

Токен НЕ зашитий у код — читається зі змінних оточення, бо репозиторій публічний.

Використання:
    set IMPORT_TOKEN=...            (Windows)     |  export IMPORT_TOKEN=...  (Linux/Mac)
    set SITE_URL=https://ваш-сайт.vercel.app
    python scripts/import_stock.py products.csv

CSV має містити колонки: sku, name, price, stock
(або перейменуйте у COLUMN_MAP нижче під свій експорт).
"""

import csv
import json
import os
import sys
import urllib.error
import urllib.request

SITE_URL = os.environ.get("SITE_URL", "http://localhost:3000").rstrip("/")
IMPORT_TOKEN = os.environ.get("IMPORT_TOKEN", "")

# Розмір партії: надсилаємо великий каталог частинами, щоб не впертись у ліміт запиту.
BATCH_SIZE = 500

# Якщо у вашому CSV інші назви колонок — змініть тут.
COLUMN_MAP = {
    "sku": ["sku", "код", "артикул", "code"],
    "name": ["name", "назва", "повна назва товару", "найменування"],
    "price": ["price", "ціна", "розд. ціна", "роздрібна ціна"],
    "stock": ["stock", "кількість", "к-ть", "залишок"],
    "barcode": [
        "barcode", "ean", "штрих-код виробника", "штрих-код", "штрихкод",
    ],
}


def pick(row: dict, keys: list) -> str:
    """Знаходить перше значення за одним із можливих імен колонки."""
    lowered = {(k or "").strip().lower(): v for k, v in row.items()}
    for key in keys:
        if key in lowered and lowered[key] not in (None, ""):
            return str(lowered[key]).strip()
    return ""


def to_number(value: str) -> float:
    cleaned = value.replace(" ", "").replace("\xa0", "").replace(",", ".")
    cleaned = "".join(ch for ch in cleaned if ch.isdigit() or ch in ".-")
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def read_csv(path: str) -> list:
    """Читає CSV. УкрСклад експортує UTF-16 з роздільником ';'."""
    for encoding in ("utf-16", "utf-8-sig", "cp1251"):
        try:
            with open(path, newline="", encoding=encoding) as handle:
                sample = handle.read(4096)
                handle.seek(0)
                delimiter = ";" if sample.count(";") >= sample.count(",") else ","
                rows = list(csv.DictReader(handle, delimiter=delimiter))
            if rows:
                print(f"Прочитано {len(rows)} рядків (кодування {encoding}, роздільник '{delimiter}')")
                return rows
        except (UnicodeDecodeError, UnicodeError):
            continue
    raise SystemExit(f"Не вдалося прочитати {path}")


def build_items(rows: list) -> list:
    items = []
    for row in rows:
        sku = pick(row, COLUMN_MAP["sku"])
        name = pick(row, COLUMN_MAP["name"])
        if not sku or not name:
            continue
        # Optional — sent as null when the export has no barcode.
        barcode = pick(row, COLUMN_MAP["barcode"]).strip()
        items.append({
            "sku": sku,
            "name": name,
            "price": to_number(pick(row, COLUMN_MAP["price"])),
            "stock": to_number(pick(row, COLUMN_MAP["stock"])),
            "barcode": barcode or None,
        })
    return items


def send(items: list) -> int:
    payload = json.dumps({"token": IMPORT_TOKEN, "items": items}).encode("utf-8")
    request = urllib.request.Request(
        f"{SITE_URL}/api/import-stock",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            result = json.loads(response.read().decode("utf-8"))
            return int(result.get("updated", 0))
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Помилка {error.code}: {body}")


def main() -> None:
    if not IMPORT_TOKEN:
        raise SystemExit("Не задано IMPORT_TOKEN (змінна оточення).")
    if len(sys.argv) < 2:
        raise SystemExit("Вкажіть шлях до CSV: python scripts/import_stock.py products.csv")

    items = build_items(read_csv(sys.argv[1]))
    if not items:
        raise SystemExit("У файлі не знайдено придатних товарів.")

    total = 0
    for start in range(0, len(items), BATCH_SIZE):
        batch = items[start:start + BATCH_SIZE]
        total += send(batch)
        print(f"  надіслано {min(start + BATCH_SIZE, len(items))} / {len(items)}")

    print(f"Готово. Оновлено товарів: {total}")


if __name__ == "__main__":
    main()
