"""Cache management for market data."""

import pickle
from datetime import datetime
from pathlib import Path
from constants import CACHE_DIR, CACHE_FILE


def load_cache(max_age_days=7):
    """Load cached market data if it exists and is not expired."""
    cache_path = Path(CACHE_FILE)
    if cache_path.exists():
        # Check age â€” discard if older than max_age_days
        age = datetime.now() - datetime.fromtimestamp(cache_path.stat().st_mtime)
        if age.days > max_age_days:
            print(f"Cache expired ({age.days} days old, max {max_age_days}). Starting fresh.")
            cache_path.unlink()
            return {}
        try:
            with open(cache_path, 'rb') as f:
                return pickle.load(f)
        except Exception:
            return {}
    return {}


def save_cache(cache):
    """Save market data cache."""
    cache_dir = Path(CACHE_DIR)
    cache_dir.mkdir(exist_ok=True)
    cache_path = Path(CACHE_FILE)
    with open(cache_path, 'wb') as f:
        pickle.dump(cache, f)


def clear_cache():
    """Delete the cache file if it exists."""
    cache_path = Path(CACHE_FILE)
    if cache_path.exists():
        cache_path.unlink()
        print("Cache cleared.")
