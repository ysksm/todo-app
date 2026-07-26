# TODO API

## Requirements

- [uv](https://docs.astral.sh/uv/)
- Python 3.13 (managed by `uv` through `.python-version`)

## Setup and run

From the repository root, synchronize dependencies and start the development server:

```sh
cd web-backend
uv sync
./start.sh
```

The API is available at `http://127.0.0.1:8000`, and Swagger UI is available at
`http://127.0.0.1:8000/docs`.

`start.sh` can also be run from the repository root:

```sh
sh ./web-backend/start.sh
```

Todo data is persisted to `data/todos.jsonl`. Set `TODO_DATA_FILE` to use a
different JSONL file.

## Changing the listen host and port

`start.sh` listens on `127.0.0.1:8000` by default. To change this, copy
`.env.example` to `.env` and edit `HOST` / `PORT`:

```sh
cd web-backend
cp .env.example .env
# edit .env, e.g. PORT=3000
```

Environment variables also work without a `.env` file:

```sh
PORT=3000 ./start.sh
```

## Project structure

- `api/`: FastAPI routers, organized by resource
- `models/`: Pydantic request and response models
- `repositories/`: persistence implementations

Add a new resource by creating its router under `api/` and registering it in
`main.py`.
