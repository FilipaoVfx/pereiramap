"""Prueba de extremo a extremo del flujo, SIN tocar Supabase.

Sirve `dist/`, abre la app en Chromium con una ubicación simulada, le da la
foto de prueba (con EXIF GPS) por el input de cámara, pulsa Enviar y captura
las tres llamadas HTTP con un mock. Comprueba:

  1. que las dos imágenes subidas NO llevan EXIF (ni el bloque APP1);
  2. que el payload trae las coordenadas del EXIF y las del dispositivo,
     la hora de la foto, el rumbo y el hash de la imagen subida;
  3. que el hash declarado es el SHA-256 de los bytes que se subieron;
  4. que la pantalla final dice "Enviada".

Uso:  python test/e2e_check.py [ruta/al/chromium]
Requiere `pip install playwright` y `npm run build` antes.
"""
from __future__ import annotations

import hashlib
import http.server
import json
import sys
import threading
from functools import partial
from pathlib import Path

from playwright.sync_api import Route, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
FIXTURE = ROOT / "test" / "fixture_gps.jpg"
PORT = 8123
DEVICE = {"latitude": 4.8150, "longitude": -75.6950, "accuracy": 12}


def serve() -> http.server.ThreadingHTTPServer:
    handler = partial(http.server.SimpleHTTPRequestHandler, directory=str(DIST))
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def main(chromium: str | None) -> int:
    assert (DIST / "index.html").exists(), "falta dist/: corre `npm run build`"
    httpd = serve()
    uploads: dict[str, bytes] = {}
    rpc: list[dict] = []
    failures: list[str] = []

    def on_storage(route: Route) -> None:
        path = route.request.url.split("/object/field-photos/")[1]
        uploads[path] = route.request.post_data_buffer or b""
        route.fulfill(status=200, content_type="application/json", body=json.dumps({"Key": path}))

    def on_rpc(route: Route) -> None:
        body = json.loads(route.request.post_data or "{}")
        rpc.append(body["p"])
        p = body["p"]
        route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps(
                {
                    "observation_id": p["observation_id"],
                    "received_at": "2026-09-18T19:32:12Z",
                    "location_source": "DEVICE",
                    "lon": p["device_lon"],
                    "lat": p["device_lat"],
                    "exif_device_offset_m": 88.0,
                    "review_status": "PENDIENTE",
                }
            ),
        )

    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=chromium) if chromium else p.chromium.launch()
        ctx = browser.new_context(
            viewport={"width": 390, "height": 844},
            geolocation=DEVICE,
            permissions=["geolocation"],
        )
        page = ctx.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.route("**/storage/v1/object/field-photos/**", on_storage)
        page.route("**/rest/v1/rpc/pereiramap_enviar", on_rpc)
        page.goto(f"http://127.0.0.1:{PORT}/")
        page.wait_for_selector("text=Ubicación lista", timeout=15000)
        page.set_input_files("input[type=file]", str(FIXTURE))
        page.wait_for_selector("text=GPS en la foto", timeout=15000)
        facts = page.inner_text(".facts")
        if "sí" not in facts:
            failures.append(f"la pantalla no reconoce el GPS del EXIF: {facts!r}")
        if "sin metadatos" not in facts:
            failures.append("la pantalla no declara que la imagen va sin metadatos")
        page.click("button.chip:has-text('Daño estructural')")
        page.click("button.btn.primary:has-text('Enviar')")
        page.wait_for_selector("text=Enviada", timeout=20000)
        page.screenshot(path=str(ROOT / "test" / "e2e_done.png"))
        browser.close()
    httpd.shutdown()

    # 1. Sin EXIF en lo subido.
    if set(k.split("/")[1] for k in uploads) != {"full.jpg", "thumb.jpg"}:
        failures.append(f"subidas inesperadas: {sorted(uploads)}")
    for path, data in uploads.items():
        if data[:2] != b"\xff\xd8":
            failures.append(f"{path}: no es JPEG")
        if b"Exif\x00\x00" in data or data[2:4] == b"\xff\xe1":
            failures.append(f"{path}: conserva un bloque EXIF")
    # 2-3. Payload.
    if len(rpc) != 1:
        failures.append(f"se esperaba 1 llamada RPC, hubo {len(rpc)}")
    else:
        pl = rpc[0]
        full = next((v for k, v in uploads.items() if k.endswith("full.jpg")), b"")
        checks = {
            "exif_lat ≈ 4.8143": abs((pl["exif_lat"] or 0) - 4.8143) < 0.0005,
            "exif_lon ≈ -75.6946": abs((pl["exif_lon"] or 0) + 75.6946) < 0.0005,
            "exif_heading 123.5": pl["exif_heading_deg"] == 123.5,
            "exif_captured_at 2026-09-18": str(pl["exif_captured_at"]).startswith("2026-09-18"),
            "device_lat": abs(pl["device_lat"] - DEVICE["latitude"]) < 1e-6,
            "device_lon": abs(pl["device_lon"] - DEVICE["longitude"]) < 1e-6,
            "accuracy_m": pl["accuracy_m"] == DEVICE["accuracy"],
            "device_fix_at": bool(pl["device_fix_at"]),
            "category": pl["category"] == "DANO_ESTRUCTURAL",
            "sha256 == subida": pl["image_sha256"] == hashlib.sha256(full).hexdigest(),
            "original_sha256": pl["original_sha256"] == hashlib.sha256(FIXTURE.read_bytes()).hexdigest(),
            "original_bytes": pl["original_bytes"] == FIXTURE.stat().st_size,
            "width/height": pl["width"] == 1600 and pl["height"] == 1200,
            "uuid": len(pl["observation_id"]) == 36 and len(pl["device_id"]) == 36,
            "app_version": bool(pl["app_version"]),
        }
        failures += [f"payload: {k}" for k, ok in checks.items() if not ok]
    if errors:
        failures.append(f"errores de consola: {errors}")

    print(f"subidas: {[(k, len(v)) for k, v in uploads.items()]}")
    print(f"payload: {json.dumps(rpc[0], indent=1, ensure_ascii=False) if rpc else '-'}")
    if failures:
        print("FALLA:\n  " + "\n  ".join(failures))
        return 1
    print("OK: flujo completo sin EXIF en la subida, coordenadas y hash correctos")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else None))
