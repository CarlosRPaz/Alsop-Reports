"""
spine.py
--------
Loads the Spine sheet (agent name mapping table) and provides lookup
functions to resolve any name variant to a canonical agent record.

The Spine maps: Agent nickname, Office, Full Name, RC Name, Rico Name,
HS User Name, NB Sub-Producer Name, Quotes Sub Producer, Team, AgencyZoom Name.

Each external system uses a different name format. This module normalizes
them all to a single canonical Agent nickname.
"""

import pandas as pd
from pathlib import Path


class Spine:
    """Agent name resolver. Maps any name variant from any system to the canonical record."""

    def __init__(self, source_path: str, sheet_name: str = "Spine",
                 excluded_agents: list[str] | None = None):
        self.df = pd.read_excel(source_path, sheet_name=sheet_name, engine="openpyxl")
        # Normalized set of excluded canonical agent nicknames
        self._excluded = {
            self._normalize(str(a)) for a in (excluded_agents or []) if a
        }
        self._build_lookup()

    def _build_lookup(self):
        """Build a case-insensitive lookup dict: normalized_name -> agent row."""
        self._lookup: dict[str, dict] = {}

        name_columns = [
            "Agent", "Full Name", "RC Name", "Rico Name",
            "HS User Name", "NB Sub-Producer Name",
            "Quotes Sub Producer", "AgencyZoom Name",
        ]

        for _, row in self.df.iterrows():
            agent_name = row.get("Agent", "")
            # Skip agents the user has marked as excluded
            if agent_name and self._normalize(str(agent_name)) in self._excluded:
                continue

            record = {
                "agent": agent_name,
                "office": row.get("Office", ""),
                "full_name": row.get("Full Name", ""),
                "team": row.get("Team", ""),
            }

            for col in name_columns:
                name = row.get(col)
                if pd.notna(name) and str(name).strip():
                    key = self._normalize(str(name))
                    self._lookup[key] = record

                    # Also index the name portion after the sub-producer code
                    # e.g. "387-ALEX CLANCY" -> "ALEX CLANCY"
                    if "-" in str(name) and str(name)[0].isdigit():
                        stripped = str(name).split("-", 1)[1].strip()
                        self._lookup[self._normalize(stripped)] = record

    @staticmethod
    def _normalize(name: str) -> str:
        import re
        return re.sub(r'\s+', ' ', name.strip()).upper()

    def resolve(self, name: str) -> dict | None:
        """
        Given any name variant, return the canonical agent record or None.
        Returns dict with keys: agent, office, full_name, team
        """
        if not name or not str(name).strip():
            return None
        key = self._normalize(str(name))
        if key in self._lookup:
            return self._lookup[key]

        # Fuzzy fallback: try matching first + last name
        parts = key.split()
        if len(parts) >= 2:
            for stored_key, record in self._lookup.items():
                stored_parts = stored_key.split()
                if len(stored_parts) >= 2:
                    if parts[0] == stored_parts[0] and parts[-1] == stored_parts[-1]:
                        return record
        return None

    def resolve_agent(self, name: str) -> str | None:
        """Return just the canonical agent nickname, or None."""
        record = self.resolve(name)
        return record["agent"] if record else None

    def all_agents(self) -> list[dict]:
        """Return a list of all unique agent records."""
        seen = set()
        agents = []
        for record in self._lookup.values():
            key = record["agent"]
            if key not in seen:
                seen.add(key)
                agents.append(record)
        return agents

    def agent_names(self) -> list[str]:
        """Return sorted list of all canonical agent nicknames."""
        return sorted(set(r["agent"] for r in self._lookup.values()))

    # ── Supabase-backed construction ──────────────────────────────────────

    @classmethod
    def from_supabase(cls, config: dict,
                      excluded_agents: list[str] | None = None) -> "Spine":
        """
        Build a Spine from the Supabase `agents` table instead of an Excel file.

        Reads each agent's `system_variants` JSONB (keys: full_name, rc_name,
        rico_name, hs_name, nb_name, quotes_name, az_name) and builds the
        same lookup dict the Excel-based constructor creates.
        """
        import os, requests

        supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or config.get("supabase", {}).get("url")
        supabase_key = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY") or config.get("supabase", {}).get("key")

        if not supabase_url or not supabase_key:
            raise RuntimeError("Supabase URL/key not found in config or env")

        headers = {
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
        }

        # Fetch all active agents with their system_variants
        res = requests.get(
            f"{supabase_url}/rest/v1/agents?active=eq.true&select=name,office,team,system_variants",
            headers=headers
        )
        if res.status_code >= 400:
            raise RuntimeError(f"Supabase agents fetch failed: {res.text}")

        agents_data = res.json()
        if not agents_data:
            raise RuntimeError("No active agents found in Supabase")

        # Build a Spine instance without calling __init__
        instance = cls.__new__(cls)
        instance.df = None  # no DataFrame in Supabase mode
        instance._excluded = {
            cls._normalize(str(a)) for a in (excluded_agents or []) if a
        }
        instance._lookup = {}
        instance._build_lookup_from_records(agents_data)
        return instance

    def _build_lookup_from_records(self, agents_data: list[dict]):
        """Build the lookup dict from Supabase agent records."""
        for agent in agents_data:
            agent_name = agent.get("name", "")
            if not agent_name:
                continue

            if self._normalize(agent_name) in self._excluded:
                continue

            variants = agent.get("system_variants") or {}
            record = {
                "agent": agent_name,
                "office": agent.get("office", ""),
                "full_name": variants.get("full_name", ""),
                "team": agent.get("team", ""),
            }

            # Index the canonical name itself
            self._lookup[self._normalize(agent_name)] = record

            # Index all variant names
            for _key, variant_name in variants.items():
                if variant_name and str(variant_name).strip():
                    norm = self._normalize(str(variant_name))
                    self._lookup[norm] = record

                    # Also index the name portion after sub-producer code
                    # e.g. "387-ALEX CLANCY" -> "ALEX CLANCY"
                    if "-" in str(variant_name) and str(variant_name)[0].isdigit():
                        stripped = str(variant_name).split("-", 1)[1].strip()
                        self._lookup[self._normalize(stripped)] = record
