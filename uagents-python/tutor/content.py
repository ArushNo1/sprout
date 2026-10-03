"""Questions and lessons, written by the ASI:One model for one concept at a time."""

import json
import os
import random
import re

import requests

ASI_URL = "https://api.asi1.ai/v1/chat/completions"
MODEL = os.getenv("ASI_ONE_MODEL", "asi1-mini")

TUTOR = ("You are Sprout, a patient tutor for a college student. Be accurate and concise, use the "
         "course's own terms, and never pad answers with filler or praise.")

LESSON_STYLES = {
    "worked_example": "Teach it with one fully worked example, step by step, then a one-line takeaway.",
    "flashcards": "Teach it as 6 flashcards, each as 'Front: ...' then 'Back: ...', building from basics to the key idea.",
    "diagram": "Teach it with a small text diagram in a code block (ASCII boxes and arrows), then 3 short bullet notes that walk through it.",
    "analogy": "Teach it with one everyday analogy, then map each part of the analogy back to the real idea, then note where the analogy breaks down.",
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
    question = str(raw.get("question", "")).strip()
    # Drop "A) " style labels the model sometimes adds; the card shows its own buttons.
    choices = [re.sub(r"^[A-Ea-e][).:]\s+", "", str(c).strip()) for c in raw.get("choices", []) if str(c).strip()]
    idx = int(raw.get("correct_index", -1))
    if not question or not 3 <= len(choices) <= 5 or not 0 <= idx < len(choices) or len(set(choices)) != len(choices):
        raise ValueError("malformed question")
    correct = choices[idx]
    rng.shuffle(choices)
    return {"question": question, "choices": choices, "correct_index": choices.index(correct),
            "explanation": str(raw.get("explanation", "")).strip()}


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


def make_lesson(course: str, concept: dict, fmt: str) -> str:
    style = LESSON_STYLES.get(fmt, LESSON_STYLES["worked_example"])
    return call_llm(f"Course: {course}\nConcept: {concept['name']}: {concept['summary']}\n\n"
                    f"Teach this concept to a student who finds it shaky. {style} "
                    f"Keep it under 220 words, in Markdown, with no heading.")
