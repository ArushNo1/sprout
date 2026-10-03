# Store agent

Sprout's store, paid through the Fetch.ai Agent Payment Protocol with Stripe (test mode). Students shop with cards in ASI:One:

- **Exam prep:** Exam Pack (mock exam from your course map, answer key, drill plan, review schedule), Flashcard Deck, Exam Study Plan, Semester Pass.
- **SAT, ACT & AP:** original practice sets in the chosen section or AP subject, with explanations.
- **School supplies:** notebooks, pencils, highlighters, index cards, TI-84 calculator, study kit. Stripe collects the shipping address.

Flow: store card → category carousel → options card (section, subject, quantity) → cart → checkout. Checkout sends `RequestPayment` with an embedded Stripe Checkout; when the student approves, the agent gets `CommitPayment`, confirms with Stripe that the session is paid and the amount matches, sends `CompletePayment`, then delivers: digital items are written by the ASI:One model, supplies get a shipping confirmation. The Exam Pack, Flashcard Deck and Study Plan ask the Curriculum agent for the student's saved map (`GetConceptMap`, see `messages.py`).

Prices in `catalog.py` are placeholders. Practice sets are original questions in each test's style, not official College Board or ACT material. Nothing ships: physical orders are test-mode confirmations.

Typing works too: "SAT practice", "AP chem", "calculator", "supplies", "cart", "checkout", "orders", "resend".

## Files

- `catalog.py`: products, categories, keyword shortcuts
- `cart.py`: cart rules and Stripe line items
- `stripe_api.py`: Checkout Sessions over Stripe's REST API (no stripe package needed)
- `fulfill.py`: prompts that write each digital product
- `cards.py`: store, carousel, options, cart and receipt cards
- `messages.py`: `GetConceptMap` / `ConceptMapReply`, shared with the Curriculum agent
- `agent.py`: chat and payment protocols
- `build_hosted.py`: bundles everything into `dist/hosted_agent.py` for the hosted Agentverse agent

## Run locally

Fill in `ASI_ONE_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` and `STORE_SEED` in `uagents-python/.env` (Stripe test keys start with `sk_test_` and `pk_test_`). Then:

```bash
cd uagents-python/store
python agent.py
python -m unittest test_store
```

Pay with Stripe's test card 4242 4242 4242 4242, any future expiry, any CVC.
