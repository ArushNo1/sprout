"""
scheduler.py — Concept scheduler for Sprout.

Decides what to teach next using the rule from the product spec:
  "Pick the concept with the lowest mastery whose prerequisites are
   all above 0.7 (solid)."

This respects that knowledge builds on knowledge — a student won't be
sent to Eigenvalues until they have a solid grip on Linear Independence,
for example.

Usage:
    from scheduler import next_concept

    graph = {
        "Dot Product":          [],
        "Matrix Multiplication": ["Dot Product"],
        "Eigenvalues":          ["Matrix Multiplication", "Linear Independence"],
    }
    masteries = {
        "Dot Product": 0.85,
        "Matrix Multiplication": 0.72,
        "Linear Independence": 0.4,
        "Eigenvalues": 0.2,
    }
    concept = next_concept(graph, masteries)
    # → "Linear Independence"  (prereqs met, lowest mastery among unlocked)
"""

# The mastery threshold a prerequisite must reach before its dependents unlock.
PREREQ_THRESHOLD = 0.7


def next_concept(
    graph: dict[str, list[str]],
    masteries: dict[str, float],
) -> str | None:
    """
    Return the concept the student should study next.

    A concept is "unlocked" when every one of its prerequisites has a
    mastery score >= PREREQ_THRESHOLD (0.7 = "solid").

    Among all unlocked concepts, return the one with the lowest current
    mastery — that's where the student has the most to gain.

    Args:
        graph:     Dict mapping concept_id -> list of prerequisite concept_ids.
                   Concepts with no prerequisites use an empty list [].
        masteries: Dict mapping concept_id -> current p_mastered (float 0-1).
                   Concepts not yet attempted default to 0.

    Returns:
        The concept_id to study next, or None if every concept is already
        solid (mastery >= PREREQ_THRESHOLD) or no concept is unlocked.
    """
    unlocked = []

    for concept, prereqs in graph.items():
        # Skip concepts the student has already solidified.
        current = masteries.get(concept, 0.0)
        if current >= PREREQ_THRESHOLD:
            continue

        # A concept is unlocked when all its prereqs are solid.
        prereqs_met = all(
            masteries.get(prereq, 0.0) >= PREREQ_THRESHOLD
            for prereq in prereqs
        )
        if prereqs_met:
            unlocked.append((current, concept))

    if not unlocked:
        return None  # Nothing left to study — all solid, or all locked.

    # Pick the unlocked concept with the lowest mastery (most to gain).
    unlocked.sort(key=lambda x: x[0])
    return unlocked[0][1]


def unlocked_concepts(
    graph: dict[str, list[str]],
    masteries: dict[str, float],
) -> list[dict]:
    """
    Return all currently unlocked concepts with their mastery scores,
    sorted from lowest to highest mastery.

    Useful for showing the student what they can work on right now.

    Each item in the returned list is:
      { "concept": str, "mastery": float, "recommended": bool }
    The first item (lowest mastery) is flagged as recommended=True.
    """
    from bkt import mastery_label

    candidates = []
    for concept, prereqs in graph.items():
        current = masteries.get(concept, 0.0)
        if current >= PREREQ_THRESHOLD:
            continue
        prereqs_met = all(
            masteries.get(prereq, 0.0) >= PREREQ_THRESHOLD
            for prereq in prereqs
        )
        if prereqs_met:
            candidates.append({"concept": concept, "mastery": current, "label": mastery_label(current)})

    candidates.sort(key=lambda x: x["mastery"])

    # Flag the top recommendation.
    for i, c in enumerate(candidates):
        c["recommended"] = (i == 0)

    return candidates


# ---------------------------------------------------------------------------
# Demo — run with: python scheduler.py
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import json, pathlib
    from bkt import mastery_label

    demo = json.loads((pathlib.Path(__file__).parent / "demo_data.json").read_text())

    # Build masteries from the demo data (simulate running all answers).
    from bkt import DEFAULT_PARAMS, update_mastery
    masteries = {}
    for concept in demo["concepts"]:
        p = DEFAULT_PARAMS["prior"]
        for correct in concept["answers"]:
            p = update_mastery(p, correct)
        masteries[concept["name"]] = p

    graph = {c["name"]: c.get("prereqs", []) for c in demo["concepts"]}

    print("── Current mastery ──")
    for name, p in masteries.items():
        print(f"  {name:<28}  {p*100:5.1f}%  ({mastery_label(p)})")

    print("\n── Unlocked concepts (can study now) ──")
    for c in unlocked_concepts(graph, masteries):
        tag = " ← recommended" if c["recommended"] else ""
        print(f"  {c['concept']:<28}  {c['mastery']*100:5.1f}%  ({c['label']}){tag}")

    nxt = next_concept(graph, masteries)
    print(f"\n── Teach next: {nxt} ──")
