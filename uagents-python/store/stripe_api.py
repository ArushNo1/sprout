"""Stripe Checkout over its REST API with requests, so the hosted agent needs no stripe package.

ASI:One shows an embedded Checkout when RequestPayment carries metadata["stripe"]
(ui_mode, publishable_key, client_secret, checkout_session_id). Use test keys
(sk_test_/pk_test_) and Stripe's test card 4242 4242 4242 4242: no real money moves.
"""

import os
import time

import requests

API = "https://api.stripe.com/v1"
RETURN_URL = os.getenv("STRIPE_RETURN_URL", "https://agentverse.ai/payment-success")


def _flatten(value, prefix="") -> list:
    """Stripe wants nested form fields: line_items[0][price_data][currency]=usd."""
    if isinstance(value, dict):
        out = []
        for k, v in value.items():
            out += _flatten(v, f"{prefix}[{k}]" if prefix else k)
        return out
    if isinstance(value, list):
        out = []
        for i, v in enumerate(value):
            out += _flatten(v, f"{prefix}[{i}]")
        return out
    if isinstance(value, bool):
        value = "true" if value else "false"
    return [(prefix, str(value))]


def _keys():
    secret, publishable = os.getenv("STRIPE_SECRET_KEY"), os.getenv("STRIPE_PUBLISHABLE_KEY")
    if not (secret and publishable):
        raise RuntimeError("Stripe keys are missing (STRIPE_SECRET_KEY / STRIPE_PUBLISHABLE_KEY).")
    return secret, publishable


def checkout_params(line_items: list, ship: bool, metadata: dict, now=None) -> dict:
    params = {
        "mode": "payment",
        "ui_mode": "embedded",
        "redirect_on_completion": "if_required",
        "return_url": f"{RETURN_URL}?session_id={{CHECKOUT_SESSION_ID}}",
        "payment_method_types": ["card"],
        "line_items": line_items,
        "expires_at": int(now or time.time()) + 1800,  # Stripe's minimum is 30 minutes
        "metadata": metadata,
    }
    if ship:
        params["shipping_address_collection"] = {"allowed_countries": ["US"]}
    return params


def create_checkout(line_items: list, ship: bool, metadata: dict) -> dict:
    """Returns the metadata["stripe"] block ASI:One needs to render the embedded checkout."""
    secret, publishable = _keys()
    resp = requests.post(f"{API}/checkout/sessions", auth=(secret, ""),
                         data=_flatten(checkout_params(line_items, ship, metadata)), timeout=30)
    if resp.status_code >= 400:
        raise RuntimeError(f"Stripe error {resp.status_code}: {resp.json().get('error', {}).get('message', resp.text)[:200]}")
    session = resp.json()
    return {
        "ui_mode": "embedded",
        "publishable_key": publishable,
        "client_secret": session["client_secret"],
        "checkout_session_id": session["id"],
        "id": session["id"],
        "currency": "usd",
        "amount_cents": str(session["amount_total"]),
    }


def get_session(session_id: str) -> dict:
    secret, _ = _keys()
    resp = requests.get(f"{API}/checkout/sessions/{session_id}", auth=(secret, ""), timeout=30)
    resp.raise_for_status()
    return resp.json()


def shipping_of(session: dict):
    """Name and one-line address, from either the current or older Stripe API shape."""
    info = (session.get("collected_information") or {}).get("shipping_details") or session.get("shipping_details")
    if not info:
        return None
    a = info.get("address") or {}
    parts = [a.get("line1"), a.get("line2"), a.get("city"), a.get("state"), a.get("postal_code")]
    return {"name": info.get("name") or "", "address": ", ".join(p for p in parts if p)}
