"""Pure attribution math helpers shared across the backend."""

from __future__ import annotations

from typing import Iterable, Sequence


def price_return(price_start, price_end) -> float:
    """Return (price_end / price_start) - 1 with safe zero/None handling."""
    if price_start is None or price_end is None or price_start == 0:
        return 0.0
    return float(price_end / price_start) - 1.0


def apply_fx_adjustment(raw_return, fx_return=0.0, needs_fx: bool = False):
    """Apply multiplicative FX adjustment to a scalar or pandas Series."""
    if not needs_fx:
        return raw_return
    return (1 + raw_return) * (1 + fx_return) - 1


def compound_growth_factor(returns: Iterable[float]) -> float:
    """Return Π(1 + r_t) for a return series."""
    factor = 1.0
    for value in returns:
        factor *= 1.0 + float(value)
    return factor


def geometric_chain(returns: Iterable[float]) -> float:
    """Return Π(1 + r_t) - 1 for a return series."""
    return compound_growth_factor(returns) - 1.0


def suffix_growth_factors(returns: Sequence[float]) -> list[float]:
    """
    Compute the forward-compounding factor for each entry in chronological order.

    For returns [r1, r2, r3], returns [ (1+r2)(1+r3), (1+r3), 1 ].
    """
    values = [float(r) for r in returns]
    factors = [1.0] * len(values)
    running = 1.0
    for idx in range(len(values) - 1, -1, -1):
        factors[idx] = running
        running *= 1.0 + values[idx]
    return factors


def forward_compound_series(values: Iterable[float], returns: Sequence[float]) -> float:
    """
    Forward-compound a value series through the returns that follow it.

    This computes:
      Σ_t value_t × Π_{s>t}(1 + return_s)
    """
    value_list = [float(v) for v in values]
    suffix_factors = suffix_growth_factors(returns)

    if len(value_list) != len(suffix_factors):
        raise ValueError("values and returns must have the same length")

    return sum(value * factor for value, factor in zip(value_list, suffix_factors))


def forward_compounded_contribution(sub_data: Iterable[tuple[float, float]]) -> float:
    """
    Compute Σ_t [w_t × r_t × Π_{s>t}(1+r_s)] for weight/return pairs.
    """
    pairs = [(float(w), float(r)) for w, r in sub_data]
    values = [w * r for w, r in pairs]
    returns = [r for _, r in pairs]
    return forward_compound_series(values, returns)
