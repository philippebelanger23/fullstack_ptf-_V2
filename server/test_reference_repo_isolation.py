import sys
from pathlib import Path


SERVER_DIR = Path(__file__).parent.resolve()
REPO_ROOT = SERVER_DIR.parent.resolve()


def test_server_market_data_resolves_to_server_module():
    sys.path.insert(0, str(SERVER_DIR))
    try:
        import market_data  # noqa: PLC0415

        resolved = Path(market_data.__file__).resolve()
        assert resolved.parent == SERVER_DIR
    finally:
        if sys.path and sys.path[0] == str(SERVER_DIR):
            sys.path.pop(0)


def test_runtime_code_does_not_reference_reference_repo():
    runtime_roots = [REPO_ROOT / "server", REPO_ROOT / "client"]
    blocked = "Return_Contribution_Python"
    allowed_suffixes = {".py", ".ts", ".tsx", ".js", ".jsx"}
    violations = []

    for root in runtime_roots:
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix not in allowed_suffixes:
                continue
            if "__pycache__" in path.parts or "node_modules" in path.parts:
                continue
            if path.name.startswith("test_"):
                continue
            text = path.read_text(encoding="utf-8", errors="ignore")
            if blocked in text:
                violations.append(str(path.relative_to(REPO_ROOT)))

    assert violations == []
