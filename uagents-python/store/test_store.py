import json
import unittest
from datetime import date

from cart import CartError, add_line, empty_cart, needs_shipping, remove_line, stripe_line_items, summary_lines, total_cents
from catalog import BY_ID, PRODUCTS, match_keywords
from fulfill import needs_map, prompt_for
from stripe_api import _flatten, checkout_params, shipping_of


class CartTest(unittest.TestCase):
    def test_add_merge_and_totals(self):
        cart = add_line(empty_cart(), "pencils", 2)
        cart = add_line(cart, "pencils", "1")
        cart = add_line(cart, "sat_practice", 1, {"section": "Math", "junk": "x"})
        self.assertEqual(cart["lines"][0]["qty"], 3)
        self.assertEqual(cart["lines"][1]["options"], {"section": "Math"})
        self.assertEqual(total_cents(cart), 3 * 399 + 299)
        self.assertTrue(needs_shipping(cart))
        self.assertEqual(summary_lines(cart), ["#2 Pencils, 12-pack x3: $11.97", "SAT Practice Set (Math): $2.99"])

    def test_rules(self):
        with self.assertRaises(CartError):
            add_line(empty_cart(), "sat_practice", 1, {})  # section required
        with self.assertRaises(CartError):
            add_line(empty_cart(), "ap_practice", 1, {"subject": "Underwater Basket Weaving"})
        with self.assertRaises(CartError):
            add_line(empty_cart(), "nope")
        cart = add_line(empty_cart(), "semester_pass", 4)
        self.assertEqual(cart["lines"][0]["qty"], 1)  # passes are one per line
        with self.assertRaises(CartError):
            add_line(cart, "semester_pass")  # no duplicates of digital items
        self.assertEqual(add_line(empty_cart(), "calculator", 99)["lines"][0]["qty"], 5)
        self.assertFalse(needs_shipping(cart))
        self.assertEqual(remove_line(cart, "0"), empty_cart())
        self.assertEqual(remove_line(cart, "nope"), cart)


class StripeTest(unittest.TestCase):
    def test_params_flatten_like_stripe_expects(self):
        cart = add_line(empty_cart(), "notebooks", 2)
        params = checkout_params(stripe_line_items(cart), True, {"order_id": "AB12"}, now=1000)
        flat = dict(_flatten(params))
        self.assertEqual(flat["line_items[0][price_data][unit_amount]"], "699")
        self.assertEqual(flat["line_items[0][quantity]"], "2")
        self.assertEqual(flat["shipping_address_collection[allowed_countries][0]"], "US")
        self.assertEqual(flat["ui_mode"], "embedded")
        self.assertEqual(flat["expires_at"], "2800")
        self.assertEqual(flat["metadata[order_id]"], "AB12")

    def test_shipping_shapes(self):
        new = {"collected_information": {"shipping_details": {"name": "Pat", "address": {"line1": "1 Main", "city": "Atlanta", "state": "GA", "postal_code": "30332"}}}}
        old = {"shipping_details": {"name": "Pat", "address": {"line1": "1 Main", "city": "Atlanta"}}}
        self.assertEqual(shipping_of(new)["address"], "1 Main, Atlanta, GA, 30332")
        self.assertEqual(shipping_of(old)["name"], "Pat")
        self.assertIsNone(shipping_of({}))


class IntentTest(unittest.TestCase):
    def test_keywords(self):
        self.assertEqual(match_keywords("I need SAT practice"), ("product", "sat_practice"))
        self.assertEqual(match_keywords("AP Calc help"), ("product", "ap_practice"))
        self.assertEqual(match_keywords("can I get a TI-84"), ("product", "calculator"))
        self.assertEqual(match_keywords("buy school supplies"), ("category", "supplies"))
        self.assertEqual(match_keywords("show my cart"), ("action", "cart"))
        self.assertEqual(match_keywords("resend please"), ("action", "resend"))
        self.assertIsNone(match_keywords("an exact answer"))  # "act" only as a whole word


class FulfillTest(unittest.TestCase):
    CMAP = {"course": {"name": "Linear Algebra", "exam_date": "2026-10-20"}, "order": ["a"],
            "concepts": [{"id": "a", "name": "Row reduction", "summary": "Solve systems", "depth": 0}]}

    def test_every_digital_product_has_a_prompt(self):
        opts = {"sat_practice": {"section": "Math"}, "act_practice": {"section": "Science"},
                "ap_practice": {"subject": "Biology"}, "study_plan": {"exam_date": "2026-10-10"}}
        for p in PRODUCTS:
            if p["kind"] == "digital":
                prompt = prompt_for({"product_id": p["id"], "options": opts.get(p["id"], {})}, self.CMAP, date(2026, 10, 3))
                self.assertGreater(len(prompt), 40, p["id"])

    def test_exam_pack_uses_map_and_dates(self):
        line = {"product_id": "exam_pack", "options": {}}
        self.assertTrue(needs_map(line))
        prompt = prompt_for(line, self.CMAP, date(2026, 10, 3))
        self.assertIn("Row reduction", prompt)
        self.assertIn("2026-10-20", prompt)
        self.assertFalse(needs_map({"product_id": "exam_pack", "options": {"course": "Chem"}}))


class CardTest(unittest.TestCase):
    def test_cards_are_valid_json_and_small(self):
        from cards import cart_card, category_card, home_card, options_card, receipt_card
        cart = add_line(add_line(empty_cart(), "calculator", 1), "ap_practice", 1, {"subject": "Chemistry"})
        msgs = [home_card(cart), cart_card(cart, "Added"), cart_card(empty_cart()),
                receipt_card({"id": "AB12", "total_cents": 100, "summary": ["x"], "shipping": {"name": "Pat", "address": "Atlanta"}})]
        msgs += [category_card(c, cart) for c in ("exam_prep", "test_practice", "supplies")]
        msgs += [options_card(p["id"]) for p in PRODUCTS]
        for m in msgs:
            md = m.content[1].metadata
            payload = json.loads(md["card_payload"])
            self.assertLess(len(md["card_payload"]), 64_000)
            self.assertTrue("root" in payload or "items" in payload)


if __name__ == "__main__":
    unittest.main()
