from fastapi import FastAPI

from api.todos import router as todo_router

app = FastAPI(title="TODO API")
app.include_router(todo_router)


def main():
    print("Hello from web-backend!")


if __name__ == "__main__":
    main()
