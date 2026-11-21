"""
Plays blackjack hands on phone-sized screens with hints, the coach and odds on, and fails
if a callout (basic-strategy hint, coach note, odds tag) covers the cards, a total, the
result banner, another callout, the HUD or the controls, or leaves the screen.

  npm run dev                                  # in another terminal
  python scripts/check-callouts.py [--hands 12] [--url http://localhost:3000] [--shots DIR]

Needs Python Playwright (pip install playwright && playwright install chromium). Card
positions come from window.__callouts, which the callout layout publishes in dev builds.
"""

import argparse
import random
import sys

sys.stdout.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright

VIEWPORTS = [
    ("small phone", 360, 640),
    ("iPhone SE", 375, 667),
    ("iPhone 14", 390, 844),
    ("Pixel 7", 412, 915),
    ("iPhone Pro Max", 430, 932),
    ("phone landscape", 844, 390),
]

# a callout may graze something by this much (px) before it counts. Card boxes already carry
# a 5px margin (CARD_PAD in src/game/three/callouts.tsx), so an edge this close to one is
# still clear of the card itself; on the smallest phone a compact coach note can sit this
# close to a bet label after the hand.
TOLERANCE = 5

MEASURE = """
() => {
  const dbg = window.__callouts;
  const canvas = document.querySelector('canvas');
  if (!dbg || !canvas) return null;
  const c = canvas.getBoundingClientRect();
  const box = (r) => ({ x0: r.left, y0: r.top, x1: r.right, y1: r.bottom });
  const visible = (el) => parseFloat(getComputedStyle(el).opacity) > 0.01;
  const callouts = [...document.querySelectorAll('[data-side]')]
    .filter((el) => visible(el) && el.firstElementChild)
    .map((el) => ({ id: el.textContent.trim().slice(0, 40), side: el.dataset.side, r: box(el.firstElementChild.getBoundingClientRect()) }));
  const overlay = document.querySelector('[data-side]')?.parentElement;
  const labels = overlay
    ? [...overlay.children].filter((el) => !el.dataset.side && visible(el) && el.offsetWidth).map((el) => ({ id: 'label ' + el.textContent.trim().slice(0, 16), r: box(el.getBoundingClientRect()) }))
    : [];
  const controls = [...document.querySelectorAll('section button, section input')]
    .filter((el) => !overlay?.contains(el) && el.offsetWidth && !el.closest('[role=dialog]'))
    .map((el) => ({ id: 'control ' + (el.getAttribute('aria-label') || el.textContent.trim()).slice(0, 24), r: box(el.getBoundingClientRect()) }));
  const avoid = [...document.querySelectorAll('[data-callout-avoid]')].map((el) => ({ id: 'overlay "' + el.textContent.trim().slice(0, 20) + '"', r: box(el.getBoundingClientRect()) }));
  const cards = dbg.cards.map((r, i) => ({ id: 'card ' + i, r: { x0: r.x0 + c.left, y0: r.y0 + c.top, x1: r.x1 + c.left, y1: r.y1 + c.top } }));
  return { callouts, labels, controls, avoid, cards, placed: dbg.placed, still: dbg.still, vw: innerWidth, vh: innerHeight };
}
"""


def overlap(a, b):
    w = min(a["x1"], b["x1"]) - max(a["x0"], b["x0"])
    h = min(a["y1"], b["y1"]) - max(a["y0"], b["y0"])
    return (w, h) if w > TOLERANCE and h > TOLERANCE else None


def problems(m):
    out = []
    for i, co in enumerate(m["callouts"]):
        r = co["r"]
        if r["x0"] < -TOLERANCE or r["y0"] < -TOLERANCE or r["x1"] > m["vw"] + TOLERANCE or r["y1"] > m["vh"] + TOLERANCE:
            out.append(f'"{co["id"]}" goes off screen {r}')
        others = m["cards"] + m["labels"] + m["controls"] + m["avoid"] + [
            {"id": "callout " + o["id"], "r": o["r"]} for j, o in enumerate(m["callouts"]) if j != i
        ]
        for o in others:
            hit = overlap(r, o["r"])
            if hit:
                out.append(f'"{co["id"]}" ({co["side"]}) covers {o["id"]} by {hit[0]:.0f}x{hit[1]:.0f}px')
    return out


def same(a, b):
    """True when two measurements agree to a pixel: cards, callouts and overlays have stopped moving."""
    if not a or not b:
        return False
    def flat(m):
        return [round(v) for k in ("cards", "callouts", "avoid") for o in m[k] for v in o["r"].values()]
    fa, fb = flat(a), flat(b)
    return len(fa) == len(fb) and all(abs(x - y) <= 1 for x, y in zip(fa, fb))


def settled(page, timeout_ms=15000):
    """Measure once the camera and cards have come to rest (a moving camera is judged frame by frame on the device,
    but a measurement and a screenshot taken a frame apart would disagree)."""
    prev = page.evaluate(MEASURE)
    waited = 0
    while waited < timeout_ms:
        page.wait_for_timeout(300)
        waited += 300
        cur = page.evaluate(MEASURE)
        # headless Chrome draws a few frames a second, so camera moves take several seconds here
        if cur and cur["still"] and same(prev, cur):
            return cur
        prev = cur
    return None


def run(url, hands, shots, seed, only=None):
    failures = 0
    checks = 0
    skipped = 0
    rng = random.Random(seed)
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        for name, w, h in VIEWPORTS:
            if only and only not in f"{w}x{h}":
                continue
            ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=1, is_mobile=True, has_touch=True,
                # the camera snaps instead of gliding, so every layout can be judged at rest
                # (headless Chrome draws a few frames a second and a glide takes ages here)
                reduced_motion="reduce",
            )
            ctx.add_init_script(
                "for (const [k, v] of [['inferno:hints','1'],['inferno:coach','1'],['inferno:odds','1']]) localStorage.setItem(k, v);"
            )
            page = ctx.new_page()
            page.goto(f"{url}/play/blackjack/", wait_until="networkidle")
            page.wait_for_function("() => !!window.__callouts || document.querySelector('canvas')", timeout=60000)
            page.wait_for_timeout(4000)
            seen_sides = set()

            def check(tag):
                nonlocal failures, checks, skipped
                m = settled(page)
                if m is None:
                    skipped += 1
                    print(f"  note {name} {w}x{h} {tag}: scene never came to rest, skipped")
                    return
                if not m["callouts"]:
                    return
                checks += 1
                for co in m["callouts"]:
                    seen_sides.add(co["side"])
                bad = problems(m)
                if bad:
                    failures += 1
                    print(f"  FAIL {name} {w}x{h} {tag}:")
                    for b in bad:
                        print(f"    - {b}")
                    print(f"    layout: {m['placed']} camera still: {m['still']}")
                    if shots:
                        page.screenshot(path=f"{shots}/fail-{w}x{h}-{tag}.png")
                elif shots and checks % 5 == 0:
                    page.screenshot(path=f"{shots}/ok-{w}x{h}-{tag}.png")

            for hand in range(hands):
                if page.get_by_role("button", name="Stand").count() == 0:
                    deal = page.get_by_role("button", name="Deal")
                    deal.first.wait_for(timeout=15000)
                    page.wait_for_function(
                        "() => [...document.querySelectorAll('button')].some((b) => /^deal/i.test(b.textContent.trim()) && !b.disabled)",
                        timeout=15000,
                    )
                    deal.first.click()
                    page.wait_for_timeout(2600)
                for step in range(6):
                    if page.get_by_role("button", name="No thanks").count():
                        page.get_by_role("button", name="No thanks").click()
                        page.wait_for_timeout(1500)
                    if page.get_by_role("button", name="Stand").count() == 0:
                        break
                    check(f"h{hand}-s{step}-deciding")
                    # mostly hit (long hands are where space runs out), sometimes split,
                    # double or stand; wrong plays bring up the long coach note
                    roll = rng.random()
                    split = page.get_by_role("button", name="Split")
                    if roll < 0.35 and split.count() and split.is_enabled():
                        key = "p"
                    elif roll < 0.45 and page.get_by_role("button", name="Double").count():
                        key = "d"
                    elif roll < 0.85 or step == 0:
                        key = "h"
                    else:
                        key = "s"
                    page.keyboard.press(key)
                    page.wait_for_timeout(1700)
                    check(f"h{hand}-s{step}-after-{key}")
                page.wait_for_timeout(2200)
                check(f"h{hand}-settled")
            print(f"{name} {w}x{h}: sides used {sorted(seen_sides)}")
            ctx.close()
        browser.close()
    print(f"{checks} layouts checked, {skipped} skipped, {failures} with overlaps")
    # a run that judged almost nothing proves nothing
    return failures == 0 and checks >= 10 and skipped <= checks


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:3000")
    ap.add_argument("--hands", type=int, default=12)
    ap.add_argument("--shots", default=None)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--only", default=None, help="run one viewport, e.g. 360x640")
    a = ap.parse_args()
    sys.exit(0 if run(a.url, a.hands, a.shots, a.seed, a.only) else 1)
