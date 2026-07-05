from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app=FastAPI(title="TODO API")

class TodoCreate(BaseModel):
    title: str
    description: str = ""
    completed: bool = False

class Todo(TodoCreate):
    id: int


todos: dict[int, Todo] = {}
next_id: int = 1

@app.get("/api/todos", response_model=list[Todo])
def get_todos() -> list[Todo]:
    return list(todos.values())

@app.post("/api/todos", response_model=Todo)
def create_todo(todo_create: TodoCreate) -> Todo:
    global next_id
    todo = Todo(id=next_id, **todo_create.model_dump())
    todos[next_id] = todo
    next_id += 1
    return todo



def main():
    print("Hello from web-backend!")


if __name__ == "__main__":
    main()
