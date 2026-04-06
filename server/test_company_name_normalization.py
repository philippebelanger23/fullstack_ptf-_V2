"""Unit tests for company-name normalization used by the One Pager."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from routes.portfolio import normalize_company_name, resolve_company_name_from_info


def test_normalize_company_name_strips_common_corporate_suffixes():
    assert normalize_company_name("Microsoft Corporation") == "Microsoft"
    assert normalize_company_name("Amazon.com, Inc.") == "Amazon.com"


def test_normalize_company_name_keeps_meaningful_etf_prefixes():
    assert normalize_company_name("iShares Core MSCI EAFE ETF") == "iShares Core MSCI EAFE"


def test_normalize_company_name_leaves_non_suffix_names_alone():
    assert normalize_company_name("Royal Bank of Canada") == "Royal Bank of Canada"


def test_resolve_company_name_prefers_shortest_usable_yfinance_field():
    info = {
        "shortName": "Microsoft Corporation",
        "displayName": "Microsoft",
        "longName": "Microsoft Corporation",
    }

    assert resolve_company_name_from_info(info) == "Microsoft"

