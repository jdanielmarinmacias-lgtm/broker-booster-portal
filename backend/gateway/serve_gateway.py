"""Arranca el Respan Gateway local que usa Gu-IA.

    cd backend
    .venv\Scripts\python gateway\serve_gateway.py

Lee gateway/gateway.toml (proveedor Groq con `env:GROQ_API_KEY`) y escucha solo
en loopback, en IA_GATEWAY_PORT (8787 por defecto). Ctrl-C lo detiene. Con
`IA_GATEWAY_URL` apuntando aquí, /api/ia/chat sale por el gateway; sin esa
variable el portal sigue llamando a Groq directo.
"""
import os
from pathlib import Path

import respan_gateway as rg

CONFIG = Path(__file__).with_name("gateway.toml")
PUERTO = int(os.environ.get("IA_GATEWAY_PORT", "8787"))


def main() -> None:
    gw = rg.Gateway.from_file(str(CONFIG))
    with gw:
        print(
            "Respan Gateway escuchando en http://127.0.0.1:%d/v1 (Ctrl-C para salir)"
            % PUERTO,
            flush=True,
        )
        gw.serve_forever(port=PUERTO)


if __name__ == "__main__":
    main()
