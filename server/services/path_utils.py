"""Filesystem path helpers for runtime data files."""

from __future__ import annotations

from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVER_ROOT.parent


def resolve_storage_path(path_like: str | Path) -> Path:
    """
    Resolve a runtime storage path consistently whether the server is launched
    from the repo root or from the server directory.

    Relative `data/...` paths are anchored to `server/data/...`.
    Other relative paths keep the existing cwd-relative behavior first.
    """
    path = Path(path_like)
    if path.is_absolute():
        return path

    if path.parts and path.parts[0] == "data":
        return SERVER_ROOT / path

    cwd_candidate = Path.cwd() / path
    if cwd_candidate.exists():
        return cwd_candidate

    server_candidate = SERVER_ROOT / path
    if server_candidate.exists():
        return server_candidate

    repo_candidate = REPO_ROOT / path
    if repo_candidate.exists():
        return repo_candidate

    return cwd_candidate
