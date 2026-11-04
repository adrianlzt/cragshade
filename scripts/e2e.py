"""Prueba end-to-end del flujo de subida (método del sol) y del visor, en Chromium headless.

Uso: uv run --no-project --with playwright python scripts/e2e.py [https://localhost:5173] [salida_capturas/]
Necesita `make dev` corriendo y `make sample` hecho.
"""

import glob
import math
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://localhost:5173"
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else "e2e-shots")
SAMPLE = Path(__file__).resolve().parent.parent / "samples" / "sample-madrid.jpg"
SUN_AZ, SUN_ALT, HEADING = 86.99, 34.25, 200.0  # lo que imprime make_sample.py


def chrome_path() -> str | None:
    found = sorted(glob.glob(os.path.expanduser("~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome")))
    return found[-1] if found else None


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=chrome_path(),
            args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-certificate-errors"],
        )
        page = browser.new_page(viewport={"width": 390, "height": 844}, ignore_https_errors=True, device_scale_factor=2)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))

        page.goto(f"{BASE}/#/")
        page.wait_for_selector(".leaflet-container")
        page.screenshot(path=OUT / "1-map.png")

        page.goto(f"{BASE}/#/upload")
        page.set_input_files("input[type=file]", SAMPLE)
        page.wait_for_selector("text=Tu alias")
        page.fill("input[autocomplete=nickname]", "e2e")
        page.fill("input[placeholder^='p. ej.']", "Pared de prueba")
        page.screenshot(path=OUT / "2-details.png", full_page=True)
        page.click("button:has-text('Siguiente')")

        # Método del sol: giramos la vista hasta el sol y tocamos el centro del visor.
        page.wait_for_function("window.__psv && window.__psv.state.ready")
        yaw = (SUN_AZ - HEADING + 180) % 360 - 180
        page.evaluate(f"window.__psv.rotate({{ yaw: '{yaw}deg', pitch: '{SUN_ALT}deg' }})")
        page.wait_for_timeout(300)
        box = page.locator(".pano-box").bounding_box()
        page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        page.wait_for_selector("text=La altura coincide")
        page.screenshot(path=OUT / "3-orient-sun.png", full_page=True)
        page.click("button:has-text('Usar esta orientación')")

        page.wait_for_selector("text=Ajuste fino")
        txt = page.locator("label:has-text('Ajuste fino')").inner_text()
        print("verificación:", txt.splitlines()[0])
        page.wait_for_function("window.__psv && window.__psv.state.ready")
        page.evaluate("window.__psv.rotate({ yaw: '-200deg', pitch: '5deg' })")  # hacia el norte real
        page.wait_for_timeout(500)
        page.screenshot(path=OUT / "4-verify-north.png", full_page=True)

        page.click("button:has-text('Publicar')")
        page.wait_for_url("**/#/photo/*")
        page.wait_for_function("window.__psv && window.__psv.state.ready")
        page.wait_for_timeout(800)
        page.screenshot(path=OUT / "5-viewer.png")
        page.click("button:has-text('Mirar al sol')")
        page.wait_for_timeout(2500)
        page.screenshot(path=OUT / "6-viewer-sun.png")

        heading = page.evaluate("fetch('/api/photos').then(r => r.json()).then(l => l[0].heading_true)")
        print(f"heading guardado: {heading:.2f} (real {HEADING})")
        assert abs(((heading - HEADING + 180) % 360) - 180) < 1.5, heading
        if errors:
            print("errores en la página:", *errors, sep="\n  ")
        browser.close()


if __name__ == "__main__":
    main()
