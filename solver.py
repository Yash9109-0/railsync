"""CP-SAT based horizon scheduler for RailSync.

This module provides :func:`solve_horizon`, which uses Google OR-Tools' CP-SAT
constraint solver to produce an optimal (or best-effort within a time limit)
weekly schedule.  The previous greedy-plus-local-search optimizer is retained
as a fallback in the caller when the solver is unreachable.
"""

from ortools.sat.python import cp_model

# Coefficients are kept as integers to avoid any floating-point precision
# issues inside CP-SAT.  A common scale factor lets us express the tiny
# 0.1 off-peak bonus exactly: priority_score (0-100) -> 0-100000 units while
# the off-peak bonus becomes 100 units, preserving the 1000:1 ratio.
_SCALE = 1000
_PRIORITY_COEFF = _SCALE          # priority_score * 1000  (0..100000)
_OFF_PEAK_BONUS = 100             # 0.1 * 1000


def _minutes_to_ranges(minutes):
    """Collapse an iterable of minute offsets into sorted disjoint (lo, hi) ranges.

    Consecutive offsets are merged so that a contiguous off-peak block (which
    may contain thousands of minutes) is modelled with a single boolean rather
    than one boolean per minute.
    """
    unique = sorted(set(int(m) for m in minutes))
    ranges = []
    i = 0
    n = len(unique)
    while i < n:
        lo = unique[i]
        hi = lo
        j = i + 1
        while j < n and unique[j] == unique[j - 1] + 1:
            hi = unique[j]
            j += 1
        ranges.append((lo, hi))
        i = j
    return ranges


def solve_horizon(requests, segment_capacity_mins, horizon_total_mins):
    """Schedule every request on its segment with CP-SAT.

    Parameters
    ----------
        requests : list[dict]
            Each dict has: ``id`` (str), ``segment_id`` (int),
            ``duration_mins`` (int), ``priority_score`` (float 0-100),
            ``preferred_start_mins`` (int), and ``avoids_peak_start_mins``
            (set/list of off-peak minute offsets, may be missing or empty).
        segment_capacity_mins : dict[int, int]
            Per-segment capacity in minutes for this horizon.
        horizon_total_mins : int
            Total length of the horizon in minutes.

    Returns
    -------
        list[dict]
            One dict per *input* request (same order):
            ``{id, scheduled, start_mins, duration_mins}`` where ``scheduled``
            is a bool and ``start_mins`` is an int or None.
    """
    model = cp_model.CpModel()

    presence_vars = []
    start_vars = []
    records = []
    obj_terms = []
    segments = {}   # segment_id -> {"intervals": [interval], "durations": [int], "presences": [BoolVar]}

    for req in requests:
        rid = req["id"]
        segment_id = req["segment_id"]
        duration = int(req["duration_mins"])
        priority = float(req["priority_score"])
        avoids_peak = req.get("avoids_peak_start_mins") or []

        latest_start = horizon_total_mins - duration
        if latest_start < 0:
            latest_start = 0

        presence = model.NewBoolVar(f"presence_{rid}")
        start = model.NewIntVar(0, latest_start, f"start_{rid}")
        # end = start + duration  (AffineExpression is accepted by the API)
        interval = model.NewOptionalIntervalVar(
            start, duration, start + duration, presence, f"interval_{rid}"
        )

        presence_vars.append(presence)
        start_vars.append(start)
        records.append(req)

        # Main objective term: priority_score * presence.
        obj_terms.append(presence * round(priority * _PRIORITY_COEFF))

        # Soft off-peak bonus: +bonus weight for each request whose start lands
        # on an off-peak minute.  Membership is tested via disjoint ranges so
        # that large off-peak sets collapse to a handful of booleans.
        ranges = _minutes_to_ranges(avoids_peak)
        indicators = []
        for lo, hi in ranges:
            in_range = model.NewBoolVar(f"offpeak_{rid}_{lo}_{hi}")
            model.Add(start >= lo).OnlyEnforceIf(in_range)
            model.Add(start <= hi).OnlyEnforceIf(in_range)
            indicators.append(in_range)
        if indicators:
            off_sum = model.NewIntVar(0, len(indicators), f"offsum_{rid}")
            model.Add(off_sum == cp_model.LinearExpr.Sum(indicators))
            obj_terms.append(off_sum * _OFF_PEAK_BONUS)

        seg = segments.setdefault(segment_id, {"intervals": [], "presences": [], "durations": []})
        seg["intervals"].append(interval)
        seg["presences"].append(presence)
        seg["durations"].append(duration)

    # 2. NoOverlap per segment -- CP-SAT ignores optional intervals that are
    #    not present, so unscheduled requests do not participate.
    for seg in segments.values():
        if len(seg["intervals"]) > 1:
            model.AddNoOverlap(seg["intervals"])

    # 3. Capacity constraint per segment: sum(duration * presence) <= capacity.
    for segment_id, seg in segments.items():
        capacity = segment_capacity_mins.get(segment_id, 0)
        cap_terms = [p * d for p, d in zip(seg["presences"], seg["durations"])]
        if cap_terms:
            model.Add(cp_model.LinearExpr.Sum(cap_terms) <= capacity)

    # 4. Objective: maximize priority-weighted scheduled work plus the tiny
    #    off-peak preference.
    model.Maximize(cp_model.LinearExpr.Sum(obj_terms))

    # 5. Solve with a 10-second time limit.
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 10
    status = solver.Solve(model)

    # 6. Return results for every input request, even when only a feasible
    #    (not proven optimal) solution was found within the time limit.
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return [
            {
                "id": r["id"],
                "scheduled": False,
                "start_mins": None,
                "duration_mins": int(r["duration_mins"]),
            }
            for r in records
        ]

    results = []
    for idx, rec in enumerate(records):
        scheduled = solver.BooleanValue(presence_vars[idx])
        start_mins = solver.Value(start_vars[idx]) if scheduled else None
        results.append({
            "id": rec["id"],
            "scheduled": bool(scheduled),
            "start_mins": int(start_mins) if start_mins is not None else None,
            "duration_mins": int(rec["duration_mins"]),
        })
    return results
