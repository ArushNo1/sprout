"""Questions and lessons, written by the ASI:One model for one concept at a time."""

import json
import os
import random
import re

import requests

ASI_URL = "https://api.asi1.ai/v1/chat/completions"
MODEL = os.getenv("ASI_ONE_MODEL", "asi1-mini")

TUTOR = ("You are Sprout, a patient tutor for a college student. Be accurate and concise, use the "
         "course's own terms, and never pad answers with filler or praise. Write math as plain text, "
         "like O(n log n), n^2 or a/b; never use LaTeX or $ signs.")

# ASI:One renders $...$ as KaTeX, and the model's unbalanced dollars show up as red errors.
LATEX = [(r"\\times", "×"), (r"\\cdot", "·"), (r"\\le(?:q)?\b", "≤"), (r"\\ge(?:q)?\b", "≥"), (r"\\neq?\b", "≠"),
         (r"\\infty", "∞"), (r"\\(?:to|rightarrow)\b", "→"), (r"\\log", "log"), (r"\\ln", "ln"),
         (r"\\frac\{([^{}]*)\}\{([^{}]*)\}", r"(\1)/(\2)"), (r"\\sqrt\{([^{}]*)\}", r"√(\1)"),
         (r"\\(?:text|mathrm|mathbf|operatorname)\{([^{}]*)\}", r"\1"), (r"\\(?:left|right)\b", ""),
         (r"\\([{}])", r"\1"), (r"\\[,;!]", " ")]  # no "\ " rule: ASCII tree diagrams use "/ \"


def plain_math(text: str) -> str:
    """Turns stray LaTeX into plain text and drops $ delimiters so nothing renders as a math error."""
    for pattern, repl in LATEX:
        text = re.sub(pattern, repl, text)
    return re.sub(r"\$+(?!\d)", "", text)  # keeps prices like $5


DECK_SIZE = 4  # every flashcard tap is a round trip, so decks stay short

# Every lesson has the same frame; the database picks the format of its core section (Thompson sampling).
CORES = {
    "worked_example": ("Worked example", "One fully worked example at the level of a course exam, as a Markdown "
                       "numbered list (1., 2., ...) that shows the reasoning at each step, ending with the answer."),
    "diagram": ("Picture it", "A text diagram in a code block (ASCII boxes and arrows, or a tree), then 2 or 3 "
                "bullets that walk through it."),
    "analogy": ("An analogy", "One everyday analogy, then how each part maps to the real idea, then where the "
                "analogy breaks down."),
    "flashcards": ("Flashcards", "4 flashcards that build from the basics to the key idea, each as a line "
                   "'Q: ...' followed by a line 'A: ...'."),
}


def call_llm(prompt: str, temperature: float = 0.4) -> str:
    resp = requests.post(
        ASI_URL,
        headers={"Authorization": f"Bearer {os.environ['ASI_ONE_API_KEY']}"},
        json={"model": MODEL, "temperature": temperature,
              "messages": [{"role": "system", "content": TUTOR}, {"role": "user", "content": prompt}]},
        timeout=90,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"].strip()


def _json_object(text: str) -> dict:
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    return json.loads(fenced.group(1) if fenced else text[text.find("{"): text.rfind("}") + 1])


def clean_question(raw: dict, rng=random) -> dict:
    """Validates a model-written question and shuffles the choices so the answer isn't always A."""
    question = plain_math(str(raw.get("question", ""))).strip()
    # Drop "A) " style labels the model sometimes adds; the card shows its own buttons.
    choices = [re.sub(r"^[A-Ea-e][).:]\s+", "", plain_math(str(c)).strip()) for c in raw.get("choices", []) if str(c).strip()]
    idx = int(raw.get("correct_index", -1))
    if not question or not 3 <= len(choices) <= 5 or not 0 <= idx < len(choices) or len(set(choices)) != len(choices):
        raise ValueError("malformed question")
    correct = choices[idx]
    rng.shuffle(choices)
    return {"question": question, "choices": choices, "correct_index": choices.index(correct),
            "explanation": plain_math(str(raw.get("explanation", ""))).strip()}


def make_question(course: str, concept: dict, kind: str, avoid: list = ()) -> dict:
    """One multiple-choice question. diagnostic: gauge prior knowledge; check/review: test what was taught."""
    purpose = {"diagnostic": "find out whether the student already understands it",
               "check": "check that the student understood the lesson they just read",
               "review": "check the student still remembers it a few days later"}[kind]
    seen = f"\nDon't repeat these questions: {json.dumps(list(avoid)[-4:])}" if avoid else ""
    prompt = (f"Course: {course}\nConcept: {concept['name']}: {concept['summary']}\n\n"
              f"Write one multiple-choice question to {purpose}. Test understanding, not memorized wording, at "
              f"the level of a course exam. Give 4 choices with plausible wrong answers.{seen}\n\n"
              'Return only JSON: {"question": str, "choices": [str, str, str, str], "correct_index": int, '
              '"explanation": "one or two sentences on why the answer is right"}')
    last = None
    for _ in range(2):
        try:
            return clean_question(_json_object(call_llm(prompt)))
        except (ValueError, KeyError, TypeError, json.JSONDecodeError) as err:
            last = err
    raise ValueError(f"couldn't write a question: {last}")


def sections(markdown: str) -> dict:
    """{lowercased '## heading': body} for a Markdown answer."""
    parts = re.split(r"^#{2,3}\s+(.+?)\s*$", markdown, flags=re.M)
    return {title.strip().lower(): body.strip() for title, body in zip(parts[1::2], parts[2::2])}


def section(secs: dict, word: str) -> str:
    return next((body for title, body in secs.items() if word in title), "")


def bullets(text: str) -> list:
    return [re.sub(r"^\s*(?:[-*•]|\d+[.)])\s*", "", line).strip() for line in text.splitlines() if line.strip()]


def qa_pairs(text: str) -> list:
    """'Q: ...' / 'A: ...' lines (with or without bold, numbering or bullets) as [{front, back}]."""
    pairs, question = [], None
    for line in text.splitlines():
        line = re.sub(r"^[\s>*_\-]*(?:\d+[.)]\s*)?", "", line).replace("**", "").strip()
        m = re.match(r"^(Q|A|Question|Answer)\s*[:.]\s*(.+)", line, re.I)
        if not m:
            continue
        if m.group(1)[0].upper() == "Q":
            question = m.group(2).strip()
        elif question:
            pairs.append({"front": question, "back": m.group(2).strip()})
            question = None
    return pairs


def parse_lesson(markdown: str, fmt: str) -> dict:
    """Splits the model's lesson into what the chat shows (Markdown) and what the card shows."""
    secs = sections(plain_math(markdown))
    core_title = CORES[fmt][0]
    big, how, core = section(secs, "big idea"), section(secs, "how it works"), section(secs, core_title.lower())
    deck = qa_pairs(section(secs, "quick check"))
    core = re.sub(r"^\s*Step (\d+)\s*[:.]\s*", r"\1. ", core, flags=re.M)  # a real list, not one run-on paragraph
    if fmt == "flashcards":
        deck = qa_pairs(core) or deck  # the lesson's own flashcards; the quick check is only a fallback
        core = ""  # the flashcards live on the card
    if not big or not how or not (core or len(deck) >= 3):
        raise ValueError("lesson is missing sections")
    parts = [("The big idea", big), ("How it works", how), (core_title, core), ("Common mistakes", section(secs, "mistake"))]
    body = "\n\n".join(f"### {title}\n{text}" for title, text in parts if text)
    return {"markdown": body, "takeaways": bullets(section(secs, "takeaway"))[:4], "deck": deck[:DECK_SIZE],
            "minutes": max(2, round(len(body.split()) / 180))}


def make_lesson(course: str, concept: dict, fmt: str) -> dict:
    """A full lesson: big idea, explanation, a core section in `fmt`, mistakes, takeaways and a quick check."""
    fmt = fmt if fmt in CORES else "worked_example"
    core_title, core_how = CORES[fmt]
    prompt = (f"Course: {course}\nConcept: {concept['name']}: {concept['summary']}\n\n"
              "Write a complete lesson on this concept for a student who finds it shaky. Use exactly these sections, "
              "each starting with its '## ' heading:\n\n"
              "## The big idea\nTwo or three sentences of intuition: what it is and why it matters in this course.\n"
              "## How it works\nThe core explanation in 2 or 3 short paragraphs. Define every term you use.\n"
              f"## {core_title}\n{core_how}\n"
              "## Common mistakes\n2 or 3 bullets, each a specific mistake students make and how to avoid it.\n"
              "## Key takeaways\n3 bullets, one line each.\n"
              "## Quick check\n2 short questions, each as a line 'Q: ...' followed by a line 'A: ...'.\n\n"
              "Aim for 400 to 600 words in Markdown, with nothing before the first heading.")
    last = None
    for _ in range(2):
        try:
            return parse_lesson(call_llm(prompt), fmt)
        except ValueError as err:
            last = err
    raise ValueError(f"couldn't write a lesson: {last}")
