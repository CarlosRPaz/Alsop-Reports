"""Preview and seed the Alsop Office Directory from the reference workbook.

Run from the repository root:
    python scripts/seed_directory.py          # preview only; no database writes
    python scripts/seed_directory.py --apply  # import/update records

The importer never deletes database records. Existing entries are matched by
group and exact cleaned name, then updated; otherwise they are inserted.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path
from typing import Any

import pandas as pd


REPO_ROOT = Path(__file__).resolve().parents[1]
EXCEL_PATH = REPO_ROOT / "reference-files" / "New-Office-Directory.xlsx"
ENV_PATH = REPO_ROOT / ".env.local"

OFFICE_GROUPS = {"MONTCLAIR", "CLAREMONT", "RANCHO", "CHINO", "MONTEBELLO"}
CUSTOM_GROUPS = {
    "PROCESSES AND QUALITY",
    "AGENCY OWNER",
    "HUMAN RESOURCES",
    "RECRUITING",
    "LIFE",
}
SECTION_GROUPS = {"HELPFUL NUMBERS", "CARRIERS"}
KNOWN_GROUPS = OFFICE_GROUPS | CUSTOM_GROUPS | SECTION_GROUPS
LEGEND_ROWS = {"S – SPANISH SPEAKING", "S - SPANISH SPEAKING", "T- TELEMARKETING", "T - TELEMARKETING", "*- CSR", "* - CSR"}


def clean_text(value: Any) -> str:
    if value is None or pd.isna(value):
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def slugify(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")


def is_email(value: str) -> bool:
    return bool(re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value))


def is_phone_like(value: str) -> bool:
    # Require the value to begin like a phone number. This keeps text such as
    # "Express Handles – Report to 800-255-7828" in Notes instead of Phone.
    return bool(re.match(r"^\s*[+(]?\d", value)) and len(re.sub(r"\D", "", value)) >= 7


def normalized_group_key(value: str) -> str:
    """Normalize section headers while preserving ordinary group names."""
    value = clean_text(value).upper()
    return re.sub(r"\s*\(EXTERNAL\)\s*$", "", value).strip()


def add_unique(items: list[str], value: str) -> None:
    value = clean_text(value)
    if value and value not in items:
        items.append(value)


def normalize_notes(raw_notes: str, flags: list[str]) -> str | None:
    notes: list[str] = []
    raw_notes = clean_text(raw_notes)
    if raw_notes:
        token_map = {
            "S": "Spanish Speaking",
            "T": "Telemarketing",
            "*": "CSR",
        }
        for piece in re.split(r"[,;/|]+", raw_notes):
            piece = clean_text(piece)
            add_unique(notes, token_map.get(piece.upper(), piece))
    for flag in flags:
        add_unique(notes, flag)
    return "; ".join(notes) or None


def clean_staff_name(raw_name: str) -> tuple[str, str | None, list[str]]:
    name = clean_text(raw_name)
    flags: list[str] = []
    inferred_position: str | None = None

    if re.search(r"\(\s*Mgr\.?\s*\)", name, flags=re.IGNORECASE):
        inferred_position = "Manager"
        name = re.sub(r"\s*\(\s*Mgr\.?\s*\)\s*", " ", name, flags=re.IGNORECASE)

    marker = re.search(r"\s+([*ST]+)\s*$", name, flags=re.IGNORECASE)
    if marker:
        marker_text = marker.group(1).upper()
        name = name[: marker.start()].strip()
        if "*" in marker_text:
            flags.append("CSR")
            inferred_position = inferred_position or "CSR"
        if "S" in marker_text:
            flags.append("Spanish Speaking")
        if "T" in marker_text:
            flags.append("Telemarketing")

    return clean_text(name), inferred_position, flags


def group_type(group_name: str) -> str:
    upper = normalized_group_key(group_name)
    if upper in OFFICE_GROUPS:
        return "office"
    if upper == "HELPFUL NUMBERS":
        return "helpful_numbers"
    if upper == "CARRIERS":
        return "carriers"
    return "custom"


def classify_office_info(group: dict[str, Any], value: str) -> None:
    value = clean_text(value)
    lower = value.lower()
    if not value:
        return
    if lower.startswith("phone:"):
        group["office_phone"] = value.split(":", 1)[1].strip()
    elif lower.startswith("fax:"):
        group["fax"] = value.split(":", 1)[1].strip()
    elif lower.startswith("toll:"):
        group["toll_free_phone"] = value.split(":", 1)[1].strip()
    elif is_email(value):
        group["email"] = value
    elif re.match(r"^[A-Z]\d", value) or "agency" in lower or "psic" in lower:
        add_unique(group["identifier_lines"], value)
    else:
        add_unique(group["address_lines"], value)


def contact_entry(row: pd.Series, group_name: str, order: int) -> dict[str, Any] | None:
    producer = clean_text(row.get("Producer", ""))
    if not producer or producer.lower() == "producer":
        return None

    name, inferred_position, flags = clean_staff_name(producer)
    if not name:
        return None

    position = clean_text(row.get("Position", "")) or inferred_position
    notes = normalize_notes(clean_text(row.get("Notes", "")), flags)

    return {
        "name": name,
        "position": position or None,
        "role": None,
        "sca_code": clean_text(row.get("SCA Code", "")) or None,
        "sub_code": clean_text(row.get("Sub Code", "")) or None,
        "email": clean_text(row.get("Email", "")) or None,
        "ricochet_phone": clean_text(row.get("Ricochet", "")) or None,
        "ring_central_phone": clean_text(row.get("Ring Central", "")) or None,
        "primary_phone": None,
        "secondary_phone": None,
        "notes": notes,
        "display_order": order,
        "is_active": True,
        "_group_name": group_name,
    }


def service_entry(row: pd.Series, group_name: str, order: int) -> dict[str, Any] | None:
    name = clean_text(row.get("Office Info", ""))
    if not name or name.upper() in LEGEND_ROWS:
        return None

    candidates = [
        clean_text(row.get("Producer", "")),
        clean_text(row.get("SCA Code", "")),
        clean_text(row.get("Sub Code", "")),
        clean_text(row.get("Email", "")),
        clean_text(row.get("Ricochet", "")),
        clean_text(row.get("Ring Central", "")),
        clean_text(row.get("Notes", "")),
    ]
    phones: list[str] = []
    notes: list[str] = []
    email: str | None = None
    for value in candidates:
        if not value:
            continue
        if is_email(value):
            email = email or value
        elif is_phone_like(value):
            add_unique(phones, value)
        else:
            add_unique(notes, value)

    return {
        "name": name,
        "position": clean_text(row.get("Position", "")) or None,
        "role": None,
        "sca_code": None,
        "sub_code": None,
        "email": email,
        "ricochet_phone": None,
        "ring_central_phone": None,
        "primary_phone": phones[0] if phones else None,
        "secondary_phone": phones[1] if len(phones) > 1 else None,
        "notes": "; ".join(notes) or None,
        "display_order": order,
        "is_active": True,
        "_group_name": group_name,
    }


def parse_workbook(path: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]], bool]:
    if not path.exists():
        raise FileNotFoundError(f"Workbook not found: {path}")

    excel = pd.ExcelFile(path)
    sheet = "Office Directory" if "Office Directory" in excel.sheet_names else excel.sheet_names[0]
    df = pd.read_excel(path, sheet_name=sheet, dtype=str).fillna("")
    df.columns = [clean_text(column) for column in df.columns]

    required = {"Office Info", "Producer"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing required Excel columns: {', '.join(sorted(missing))}")

    has_position = "Position" in df.columns
    groups: list[dict[str, Any]] = []
    entries: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    group_order = 0
    entry_order: dict[str, int] = {}

    for _, row in df.iterrows():
        office_info = clean_text(row.get("Office Info", ""))
        producer = clean_text(row.get("Producer", ""))
        position = clean_text(row.get("Position", ""))
        upper = office_info.upper()
        group_key = normalized_group_key(office_info)

        if not office_info and not producer:
            continue
        if upper == "OFFICE INFO" and producer.upper() == "PRODUCER":
            continue
        if upper in LEGEND_ROWS:
            continue

        is_manager_header = bool(producer and (position.lower() == "manager" or re.search(r"\(\s*Mgr\.?\s*\)", producer, re.I)))
        is_group_header = group_key in KNOWN_GROUPS or (is_manager_header and office_info.isupper())

        if is_group_header:
            group_order += 1
            is_external = bool(re.search(r"\(EXTERNAL\)\s*$", office_info, re.I))
            current = {
                "name": group_key.title(),
                "slug": slugify(group_key),
                "description": "External contacts" if is_external else None,
                "group_type": group_type(group_key),
                "address": None,
                "office_phone": None,
                "fax": None,
                "toll_free_phone": None,
                "email": None,
                "office_identifiers": None,
                "display_order": group_order,
                "is_active": True,
                "address_lines": [],
                "identifier_lines": [],
            }
            groups.append(current)
            entry_order[current["slug"]] = 0

        if current is None:
            continue

        if current["group_type"] == "office" and not is_group_header:
            classify_office_info(current, office_info)

        entry_order[current["slug"]] += 1
        if current["group_type"] in {"helpful_numbers", "carriers"}:
            if is_group_header:
                continue
            entry = service_entry(row, current["name"], entry_order[current["slug"]])
        else:
            entry = contact_entry(row, current["name"], entry_order[current["slug"]])
        if entry:
            entries.append(entry)

    for group in groups:
        group["address"] = ", ".join(group.pop("address_lines")) or None
        group["office_identifiers"] = "; ".join(group.pop("identifier_lines")) or None

    seen: set[tuple[str, str]] = set()
    duplicates: list[str] = []
    for entry in entries:
        key = (entry["_group_name"].casefold(), entry["name"].casefold())
        if key in seen:
            duplicates.append(f"{entry['_group_name']} / {entry['name']}")
        seen.add(key)
    if duplicates:
        raise ValueError("Duplicate entries found in workbook: " + ", ".join(duplicates))

    return groups, entries, has_position


def preview(groups: list[dict[str, Any]], entries: list[dict[str, Any]], has_position: bool) -> None:
    print(f"Workbook: {EXCEL_PATH}")
    print(f"Position column found: {'yes' if has_position else 'NO'}")
    print(f"Parsed {len(groups)} groups and {len(entries)} entries:\n")
    for group in groups:
        count = sum(1 for entry in entries if entry["_group_name"] == group["name"])
        print(f"  {group['display_order']:>2}. {group['name']} [{group['group_type']}] — {count} entries")


def apply_seed(groups: list[dict[str, Any]], entries: list[dict[str, Any]], has_position: bool) -> None:
    if not has_position:
        raise RuntimeError(
            "The workbook has no Position column. Export the latest updated Google Sheet "
            "and replace reference-files/New-Office-Directory.xlsx before importing."
        )

    try:
        from dotenv import load_dotenv
    except ImportError as error:
        raise RuntimeError("Missing package python-dotenv. Install the required Python packages first.") from error

    load_dotenv(ENV_PATH)
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local")

    try:
        from supabase import Client, create_client
    except ImportError as error:
        raise RuntimeError("Missing package supabase. Install the required Python packages first.") from error

    supabase: Client = create_client(url, key)
    group_ids: dict[str, str] = {}
    groups_written = 0
    inserted = 0
    updated = 0

    for source_group in groups:
        payload = {key: value for key, value in source_group.items() if key not in {"address_lines", "identifier_lines"}}
        result = supabase.table("directory_groups").upsert(payload, on_conflict="slug").execute()
        if not result.data:
            raise RuntimeError(f"No row returned while writing group {source_group['name']}")
        group_ids[source_group["name"]] = result.data[0]["id"]
        groups_written += 1

    for source_entry in entries:
        group_name = source_entry["_group_name"]
        payload = {key: value for key, value in source_entry.items() if key != "_group_name"}
        payload["group_id"] = group_ids[group_name]

        existing = (
            supabase.table("directory_entries")
            .select("id")
            .eq("group_id", payload["group_id"])
            .eq("name", payload["name"])
            .limit(2)
            .execute()
        )
        if len(existing.data) > 1:
            raise RuntimeError(f"Multiple existing records found for {group_name} / {payload['name']}")
        if existing.data:
            supabase.table("directory_entries").update(payload).eq("id", existing.data[0]["id"]).execute()
            updated += 1
        else:
            supabase.table("directory_entries").insert(payload).execute()
            inserted += 1

    print(f"Import complete: {groups_written} groups written, {inserted} entries inserted, {updated} entries updated.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Preview or seed the Alsop Office Directory")
    parser.add_argument("--apply", action="store_true", help="Write the parsed directory to Supabase")
    args = parser.parse_args()

    try:
        groups, entries, has_position = parse_workbook(EXCEL_PATH)
        preview(groups, entries, has_position)
        if args.apply:
            apply_seed(groups, entries, has_position)
        else:
            print("\nPreview only: no database records were created or changed.")
            print("After verifying this summary, run again with --apply to import.")
        return 0
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
