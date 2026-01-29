"""Cache management for market data with TTL support."""

import pickle
import time
import logging
from pathlib import Path
from constants import CACHE_DIR, CACHE_FILE

logger = logging.getLogger(__name__)

# Cache TTL settings (in seconds)
CACHE_TTL_SECONDS = 86400  # 24 hours for price data

# Individual entry TTL for date-keyed price data
# Older entries (> 7 days old based on the date in the key) are considered permanent
# because historical prices don't change
RECENT_DATA_TTL_SECONDS = 86400 * 7  # 7 days


def load_cache():
    """
    Load cached market data if it exists and is not expired.
    
    The cache file has a modification time check - if the file is older than
    CACHE_TTL_SECONDS, we return an empty cache to force a refresh.
    However, entries for dates older than 7 days are preserved as they represent
    historical data that won't change.
    """
    cache_path = Path(CACHE_FILE)
    if cache_path.exists():
        try:
            # Check file age
            file_mtime = cache_path.stat().st_mtime
            file_age = time.time() - file_mtime
            
            with open(cache_path, 'rb') as f:
                cached_data = pickle.load(f)
            
            if file_age > CACHE_TTL_SECONDS:
                # Cache is stale - but preserve historical data entries
                # Historical entries are for dates > 7 days ago
                logger.info(f"Cache file is {file_age/3600:.1f} hours old, pruning recent entries")
                return _prune_recent_entries(cached_data)
            
            return cached_data
            
        except Exception as e:
            logger.warning(f"Error loading cache: {e}")
            return {}
    return {}


def _prune_recent_entries(cached_data):
    """
    Remove entries for recent dates (within 7 days) to force refresh.
    Keep entries for older dates as historical prices don't change.
    """
    import re
    from datetime import datetime, timedelta
    
    pruned_cache = {}
    now = datetime.now()
    cutoff = now - timedelta(days=7)
    
    for key, value in cached_data.items():
        # Keys are formatted as "TICKER_YYYY-MM-DD"
        match = re.search(r'_(\d{4}-\d{2}-\d{2})$', key)
        if match:
            try:
                date_str = match.group(1)
                entry_date = datetime.strptime(date_str, '%Y-%m-%d')
                
                # Keep entries older than 7 days (historical data)
                if entry_date < cutoff:
                    pruned_cache[key] = value
            except ValueError:
                # If date parsing fails, skip this entry (will be re-fetched)
                pass
        else:
            # Non-date keyed entries - skip (let them refresh)
            pass
    
    logger.info(f"Pruned cache: kept {len(pruned_cache)} historical entries, removed {len(cached_data) - len(pruned_cache)} recent entries")
    return pruned_cache


def save_cache(cache):
    """Save market data cache."""
    cache_dir = Path(CACHE_DIR)
    cache_dir.mkdir(exist_ok=True)
    cache_path = Path(CACHE_FILE)
    with open(cache_path, 'wb') as f:
        pickle.dump(cache, f)


def clear_cache():
    """Clear the entire cache file."""
    cache_path = Path(CACHE_FILE)
    if cache_path.exists():
        cache_path.unlink()
        logger.info("Cache cleared")


def get_cache_info():
    """Get information about the cache file."""
    cache_path = Path(CACHE_FILE)
    if not cache_path.exists():
        return {"exists": False, "entries": 0, "age_hours": None}
    
    try:
        file_mtime = cache_path.stat().st_mtime
        file_age_hours = (time.time() - file_mtime) / 3600
        
        with open(cache_path, 'rb') as f:
            cached_data = pickle.load(f)
        
        return {
            "exists": True,
            "entries": len(cached_data),
            "age_hours": round(file_age_hours, 1),
            "is_stale": file_age_hours > (CACHE_TTL_SECONDS / 3600)
        }
    except Exception as e:
        return {"exists": True, "entries": 0, "age_hours": None, "error": str(e)}
