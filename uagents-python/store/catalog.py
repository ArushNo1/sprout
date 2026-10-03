"""What the Sprout store sells. Prices are placeholders for the team to set.

kind:
- digital: written by the ASI:One model right after payment and sent in chat
- physical: ships; Stripe Checkout collects the shipping address
- pass: unlocks a feature for a period (recorded on the student's account)
"""

CATEGORIES = {
    "exam_prep": {"name": "Exam prep", "blurb": "Built from your course map"},
    "test_practice": {"name": "SAT, ACT & AP", "blurb": "Original practice sets with explanations"},
    "supplies": {"name": "School supplies", "blurb": "Shipped to you"},
}

AP_SUBJECTS = [
    "Calculus AB", "Calculus BC", "Statistics", "Physics 1", "Chemistry", "Biology",
    "Computer Science A", "US History", "World History", "English Language", "Psychology",
]

MAX_QTY = 5

PRODUCTS = [
    # Exam prep: generated from the student's course map (Curriculum agent) or a topic they type.
    {
        "id": "exam_pack", "name": "Exam Pack", "category": "exam_prep", "kind": "digital", "price_cents": 499,
        "desc": "Mock exam from your course map, answer key, drill plan and review schedule",
        "options": [
            {"name": "course", "kind": "text", "label": "Course", "placeholder": "Uses your saved course map if you leave this blank"},
            {"name": "exam_date", "kind": "date", "label": "Exam date"},
        ],
    },
    {
        "id": "flashcards", "name": "Flashcard Deck", "category": "exam_prep", "kind": "digital", "price_cents": 199,
        "desc": "30 flashcards on your course or any topic",
        "options": [{"name": "topic", "kind": "text", "label": "Topic", "placeholder": "Uses your saved course map if you leave this blank"}],
    },
    {
        "id": "study_plan", "name": "Exam Study Plan", "category": "exam_prep", "kind": "digital", "price_cents": 199,
        "desc": "A day-by-day plan from today to your exam",
        "options": [
            {"name": "course", "kind": "text", "label": "Course", "placeholder": "Uses your saved course map if you leave this blank"},
            {"name": "exam_date", "kind": "date", "label": "Exam date", "required": True},
        ],
    },
    {
        "id": "semester_pass", "name": "Semester Pass", "category": "exam_prep", "kind": "pass", "price_cents": 799,
        "desc": "30 days of unlimited courses and format insights",
    },
    # Standardized test practice.
    {
        "id": "sat_practice", "name": "SAT Practice Set", "category": "test_practice", "kind": "digital", "price_cents": 299,
        "desc": "15 original questions in your chosen section, with explanations",
        "options": [{"name": "section", "kind": "select", "label": "Section", "required": True,
                     "choices": ["Math", "Reading and Writing"]}],
    },
    {
        "id": "act_practice", "name": "ACT Practice Set", "category": "test_practice", "kind": "digital", "price_cents": 299,
        "desc": "15 original questions in your chosen section, with explanations",
        "options": [{"name": "section", "kind": "select", "label": "Section", "required": True,
                     "choices": ["English", "Math", "Reading", "Science"]}],
    },
    {
        "id": "ap_practice", "name": "AP Practice Set", "category": "test_practice", "kind": "digital", "price_cents": 299,
        "desc": "12 exam-style questions for your AP subject, with explanations",
        "options": [{"name": "subject", "kind": "select", "label": "AP subject", "required": True, "choices": AP_SUBJECTS}],
    },
    # Physical supplies.
    {"id": "notebooks", "name": "Spiral Notebooks, 3-pack", "category": "supplies", "kind": "physical", "price_cents": 699,
     "desc": "College ruled, 100 sheets each"},
    {"id": "pencils", "name": "#2 Pencils, 12-pack", "category": "supplies", "kind": "physical", "price_cents": 399,
     "desc": "Pre-sharpened, for scantron tests"},
    {"id": "highlighters", "name": "Highlighters, 5 colors", "category": "supplies", "kind": "physical", "price_cents": 449,
     "desc": "Chisel tip, one color per unit"},
    {"id": "index_cards", "name": "Index Cards, 300", "category": "supplies", "kind": "physical", "price_cents": 499,
     "desc": "3x5 ruled, for handwritten flashcards"},
    {"id": "calculator", "name": "TI-84 Plus CE Graphing Calculator", "category": "supplies", "kind": "physical",
     "price_cents": 11999, "desc": "Allowed on the SAT, ACT and AP exams"},
    {"id": "study_kit", "name": "Sprout Study Kit", "category": "supplies", "kind": "physical", "price_cents": 1499,
     "desc": "Notebook, highlighters, index cards and pencils"},
]

BY_ID = {p["id"]: p for p in PRODUCTS}

# Free-text shortcuts: words a student might type, mapped to a product or category.
KEYWORDS = [
    (("exam pack", "mock exam", "practice exam"), ("product", "exam_pack")),
    (("flashcard",), ("product", "flashcards")),
    (("study plan", "schedule"), ("product", "study_plan")),
    (("pass", "subscription", "premium"), ("product", "semester_pass")),
    (("sat",), ("product", "sat_practice")),
    (("act",), ("product", "act_practice")),
    (("ap ", "ap calc", "ap bio", "ap chem", "ap physics", "ap stat", "ap us", "ap world", "ap english", "ap psych", "ap cs"),
     ("product", "ap_practice")),
    (("calculator", "ti-84", "ti84"), ("product", "calculator")),
    (("notebook",), ("product", "notebooks")),
    (("pencil",), ("product", "pencils")),
    (("highlighter",), ("product", "highlighters")),
    (("index card",), ("product", "index_cards")),
    (("kit",), ("product", "study_kit")),
    (("supplies", "supply", "school stuff"), ("category", "supplies")),
    (("test prep", "practice test", "standardized"), ("category", "test_practice")),
    (("cart", "basket"), ("action", "cart")),
    (("checkout", "check out", "pay"), ("action", "checkout")),
    (("resend",), ("action", "resend")),
    (("order", "receipt", "purchase"), ("action", "orders")),
]


def match_keywords(text: str):
    t = f" {text.lower()} "
    for words, target in KEYWORDS:
        if any(f" {w.strip()} " in t or (len(w.strip()) > 3 and w.strip() in t) for w in words):
            return target
    return None



def products_in(category: str) -> list:
    return [p for p in PRODUCTS if p["category"] == category]


def money(cents: int) -> str:
    return f"${cents / 100:,.2f}"
