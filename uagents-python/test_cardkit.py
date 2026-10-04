import unittest
from unittest import mock

import cardkit


class Reply:
    def __init__(self, status, body):
        self.status_code, self._body = status, body

    def json(self):
        if self._body is None:
            raise ValueError("not json")
        return self._body


class GardenLinkTest(unittest.TestCase):
    def test_links_match_the_site_they_point_at(self):
        with mock.patch.object(cardkit, "web_url", return_value="https://sprout-garden-seven.vercel.app"):
            self.assertEqual(cardkit.garden_link("agent1qx", 7), "https://sprout-garden-seven.vercel.app/?u=agent1qx&course=7")
            self.assertEqual(cardkit.gardens_link("agent1qx"), "https://sprout-garden-seven.vercel.app/?u=agent1qx")
        with mock.patch.object(cardkit, "web_url", return_value="https://sproutlearn.tech"):
            self.assertEqual(cardkit.garden_link("agent1qx", 7), "https://sproutlearn.tech/agent1qx/garden?course=7")
            self.assertEqual(cardkit.gardens_link("agent1qx"), "https://sproutlearn.tech/agent1qx/garden")

    def test_the_new_site_is_used_only_when_it_reads_the_right_database(self):
        for reply, ready in ((Reply(200, {"ok": True, "db": "sprout-live"}), True),
                             (Reply(200, {"ok": True, "db": "sprout-0gz5d"}), False),  # up, but on another database
                             (Reply(200, {"ok": False, "db": "sprout-live"}), False),
                             (Reply(404, None), False), (Reply(200, None), False)):
            with mock.patch.object(cardkit.requests, "get", return_value=reply), \
                    mock.patch.dict("os.environ", {"SPACETIMEDB_DB": "sprout-live"}):
                self.assertEqual(cardkit.site_ready("https://sproutlearn.tech"), ready)

    def test_falls_back_to_the_first_site_and_rechecks_later(self):
        with mock.patch.object(cardkit, "WEB_URL", "https://sproutlearn.tech"), \
                mock.patch.object(cardkit, "_SITE", {"url": None, "checked": 0.0}):
            with mock.patch.object(cardkit, "site_ready", return_value=False) as check:
                self.assertEqual(cardkit.web_url(), cardkit.FALLBACK_URL)
                self.assertEqual(cardkit.web_url(), cardkit.FALLBACK_URL)
                self.assertEqual(check.call_count, 1)  # cached
            cardkit._SITE["checked"] = 0.0  # ten minutes later
            with mock.patch.object(cardkit, "site_ready", return_value=True):
                self.assertEqual(cardkit.web_url(), "https://sproutlearn.tech")


if __name__ == "__main__":
    unittest.main()
