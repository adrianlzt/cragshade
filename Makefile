.PHONY: dev backend frontend test install sample build serve tunnel

BACKEND_PORT ?= 8370
export BACKEND_PORT

install:
	cd backend && uv sync
	cd frontend && npm install

backend:
	cd backend && uv run uvicorn app.main:app --host 127.0.0.1 --port $(BACKEND_PORT) --reload

frontend:
	cd frontend && npm run dev

# Arranca los dos; Ctrl+C para ambos.
dev:
	$(MAKE) -j2 backend frontend

test:
	cd backend && uv run pytest -q
	cd frontend && npx vitest run && npm run check

# Panorámica sintética con el sol pintado donde toca, para probar el flujo de subida.
sample:
	cd backend && uv run python ../scripts/make_sample.py ../samples/sample-madrid.jpg

build:
	cd frontend && npm run build

# Versión compilada servida por FastAPI (sin recarga en caliente), para publicar.
serve: build
	cd backend && uv run uvicorn app.main:app --host 127.0.0.1 --port $(BACKEND_PORT)

# Túnel temporal de Cloudflare (URL *.trycloudflare.com) hacia `make serve`.
tunnel:
	cloudflared tunnel --no-autoupdate --url http://127.0.0.1:$(BACKEND_PORT)
