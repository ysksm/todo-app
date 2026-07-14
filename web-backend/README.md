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

## Project structure

- `api/`: FastAPI routers, organized by resource
- `models/`: Pydantic request and response models
- `repositories/`: persistence implementations

Add a new resource by creating its router under `api/` and registering it in
`main.py`.
