"""
screenshot_reader.py
--------------------
Uses Claude Vision API to extract structured agent data from screenshots
of eAgent and Ricochet screens.

The user takes screenshots and saves them to data/screenshots/.
This module sends each image to Claude and parses the structured response
into a DataFrame matching the DSR Manual / Weekly Manual schema.

Requires: ANTHROPIC_API_KEY environment variable.
"""

import os
import json
import base64
import pandas as pd
from pathlib import Path
from datetime import date

try:
    import anthropic
except ImportError:
    anthropic = None


SYSTEM_PROMPT = """You are a data extraction assistant for an insurance agency.
You will be shown a screenshot from either eAgent or Ricochet software.
Extract the data into a JSON array of objects.

IMPORTANT RULES:
- Extract EVERY agent/row visible in the screenshot
- Use the EXACT numbers shown on screen
- If a value is blank or 0, use 0
- Return ONLY valid JSON, no other text

For eAgent Dismissed To-Do's screenshots, extract:
[{"agent_name": "...", "dismissed_todos": <number>}]

For eAgent Past Due To-Do's screenshots, extract:
[{"agent_name": "...", "past_due_todos": <number>}]

For Rico Hot Pipeline screenshots, extract:
[{"agent_name": "...", "hot_pipeline": <number>}]

For eAgent #PIVOT comment screenshots, extract:
[{"agent_name": "...", "pivot_count": <number>}]

For eAgent #SAVED comment screenshots, extract:
[{"agent_name": "...", "saved_count": <number>}]

For Rico Unique Leads screenshots, extract:
[{"agent_name": "...", "unique_leads": <number>}]

For eAgent Contact/Quoted/Hot/x-sale pipeline screenshots, extract:
[{"agent_name": "...", "contact": <number>, "quoted": <number>, "hot": <number>, "xsale": <number>}]

If the screenshot type is unclear, use your best judgment based on the column headers visible.
Always return a JSON array."""


def read_screenshots(
    folder: str,
    spine=None,
    report_date: date | None = None,
) -> pd.DataFrame:
    """
    Read all image files in folder, send each to Claude Vision,
    parse responses into a combined DataFrame.
    """
    folder_path = Path(folder)
    image_files = sorted(
        f for f in folder_path.iterdir()
        if f.suffix.lower() in (".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp")
    )

    if not image_files:
        print(f"[screenshot_reader] No images found in {folder}")
        return pd.DataFrame()

    if anthropic is None:
        print("[screenshot_reader] ERROR: 'anthropic' package not installed. Run: pip install anthropic")
        return pd.DataFrame()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("[screenshot_reader] ERROR: ANTHROPIC_API_KEY not set. Skipping screenshot OCR.")
        return pd.DataFrame()

    client = anthropic.Anthropic(api_key=api_key)
    all_records = []

    for img_path in image_files:
        print(f"[screenshot_reader] Processing: {img_path.name}")
        try:
            records = _process_image(client, img_path)
            all_records.extend(records)
        except Exception as e:
            print(f"[screenshot_reader] Error processing {img_path.name}: {e}")

    if not all_records:
        return pd.DataFrame()

    df = pd.DataFrame(all_records)

    # Resolve agent names through Spine if available
    if spine is not None and "agent_name" in df.columns:
        df["Agent"] = df["agent_name"].apply(spine.resolve_agent)
        df = df.dropna(subset=["Agent"])
    elif "agent_name" in df.columns:
        df["Agent"] = df["agent_name"]

    if report_date is not None:
        df["Date"] = pd.Timestamp(report_date)

    print(f"[screenshot_reader] Total records extracted: {len(df)}")
    return df


def _process_image(client, img_path: Path) -> list[dict]:
    img_data = base64.standard_b64encode(img_path.read_bytes()).decode("utf-8")
    media_type = _get_media_type(img_path.suffix)

    response = client.messages.create(
        model="claude-sonnet-4-6-20250514",
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": img_data,
                        },
                    },
                    {
                        "type": "text",
                        "text": "Extract all agent data from this screenshot. Return ONLY a JSON array.",
                    },
                ],
            }
        ],
        system=SYSTEM_PROMPT,
    )

    text = response.content[0].text.strip()

    # Extract JSON from response (handle markdown code blocks)
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        text = text.rsplit("```", 1)[0].strip()

    records = json.loads(text)
    if not isinstance(records, list):
        records = [records]

    return records


def _get_media_type(suffix: str) -> str:
    return {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".bmp": "image/bmp",
        ".webp": "image/webp",
    }.get(suffix.lower(), "image/png")
