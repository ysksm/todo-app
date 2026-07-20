from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from api.todos import router as todo_router

app = FastAPI(title="TODO API")
app.include_router(todo_router)
app.mount("/", StaticFiles(directory="./../web-frontend/dist", html=True), name="static")

def main():
    print("Hello from web-backend!")


if __name__ == "__main__":
    main()
