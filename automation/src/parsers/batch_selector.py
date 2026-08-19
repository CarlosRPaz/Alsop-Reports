"""
batch_selector.py — Assigns undated files to target dates during multi-date runs.

For sources where files contain no internal date information (Rico AP, Premium),
this module handles the mapping of files to dates. It works by:

1. Grouping candidate files by download day
2. If all files share the same download day (Monday catch-up):
   Sort by mtime ascending and assign positionally to dates in chronological order.
3. If files come from different download days:
   Match by expected download date (target_date + 1 for weekdays, Monday for weekends).

Files are "consumed" — once assigned to a date, they are not reused.

Usage:
    selector = BatchSelector(files, dates)
    print(selector.summary())          # Show assignments for user review
    file = selector.get_file(date)     # Get assigned file for a specific date
"""

from pathlib import Path
from datetime import date as date_type, datetime, timedelta


def expected_download_date(target_date: date_type) -> date_type:
    """
    When would the file for target_date typically be downloaded?

    - Weekdays (Mon–Thu): next morning (target + 1 day)
    - Friday:  Monday morning (target + 3 days)
    - Saturday: Monday morning (target + 2 days)
    - Sunday:  Monday morning (target + 1 day)
    """
    dow = target_date.weekday()  # Mon=0 ... Sun=6
    if dow == 4:    # Friday
        return target_date + timedelta(days=3)
    elif dow == 5:  # Saturday
        return target_date + timedelta(days=2)
    elif dow == 6:  # Sunday
        return target_date + timedelta(days=1)
    else:           # Mon–Thu
        return target_date + timedelta(days=1)


def _mtime_date(path: Path) -> date_type:
    """Get the modification date of a file."""
    return datetime.fromtimestamp(path.stat().st_mtime).date()


class BatchSelector:
    """
    Assigns undated files to target dates during a multi-date batch run.

    Parameters
    ----------
    files : list[Path]
        All candidate files for this source (e.g. all Agent Performance xlsx).
    dates : list[date]
        The target dates to assign files to (e.g. [5/1, 5/2, 5/3]).

    After construction, call get_file(date) to retrieve the assigned file,
    or summary() for a human-readable mapping.
    """

    def __init__(self, files: list[Path], dates: list[date_type]):
        self.files = sorted(files, key=lambda f: f.stat().st_mtime)
        self.dates = sorted(dates)
        self._assignments: dict[date_type, Path] = {}
        self._assign()

    def _assign(self):
        """
        Smart assignment strategy:

        1. For each date, compute its expected download date.
        2. Group files by their download day (mtime date).
        3. If a date's expected download day has exactly 1 file → assign directly.
        4. If multiple dates share the same expected download day (Monday catch-up):
           The files from that day are sorted by mtime ascending and assigned
           positionally to the dates (also sorted ascending).
        """
        if not self.files or not self.dates:
            return

        # Group files by download day
        by_dl_day: dict[date_type, list[Path]] = {}
        for f in self.files:
            dl_day = _mtime_date(f)
            by_dl_day.setdefault(dl_day, []).append(f)

        # Sort each group by mtime ascending (oldest first)
        for dl_day in by_dl_day:
            by_dl_day[dl_day].sort(key=lambda f: f.stat().st_mtime)

        # Group dates by their expected download day
        dates_by_expected_dl: dict[date_type, list[date_type]] = {}
        for d in self.dates:
            expected_dl = expected_download_date(d)
            dates_by_expected_dl.setdefault(expected_dl, []).append(d)

        # For each expected download day, match files to dates
        for expected_dl, target_dates in dates_by_expected_dl.items():
            candidates = by_dl_day.get(expected_dl, [])
            if not candidates:
                # No files downloaded on the expected day — skip
                continue

            # Sort target dates ascending
            target_dates_sorted = sorted(target_dates)

            # Assign positionally: oldest file → oldest date
            for i, d in enumerate(target_dates_sorted):
                if i < len(candidates):
                    self._assignments[d] = candidates[i]

    def get_file(self, target_date: date_type) -> Path | None:
        """Get the file assigned to a specific target date, or None."""
        return self._assignments.get(target_date)

    def summary(self) -> str:
        """Human-readable summary of file-to-date assignments."""
        lines = []
        for d in self.dates:
            f = self._assignments.get(d)
            if f:
                lines.append(f"    {d}  ->  {f.name}")
            else:
                lines.append(f"    {d}  ->  !! NO FILE AVAILABLE")
        return "\n".join(lines)

    def __len__(self):
        return len(self._assignments)
