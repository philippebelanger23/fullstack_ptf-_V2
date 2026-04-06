"""Helpers for saving and loading JSON config files."""

import json
import logging
from pathlib import Path

from services.path_utils import resolve_storage_path

logger = logging.getLogger(__name__)


def save_json(path: Path, data: dict, description: str = "config") -> bool:
    """
    Write *data* to *path* as JSON, creating parent directories as needed.
    Returns True on success, raises on failure.
    """
    path = resolve_storage_path(path)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            json.dump(data, f)
        return True
    except Exception as e:
        logger.error(f"Failed to save {description} to {path}: {e}")
        raise


def load_json(path: Path, default=None, description: str = "config"):
    """
    Read and return parsed JSON from *path*.
    If the file does not exist, returns *default* (defaults to None).
    Raises on parse/IO errors.
    """
    path = resolve_storage_path(path)
    if not path.exists():
        return default
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Failed to load {description} from {path}: {e}")
        raise
