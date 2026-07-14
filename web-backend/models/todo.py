from pydantic import BaseModel


class TodoCreate(BaseModel):
    title: str
    description: str = ""
    completed: bool = False


class Todo(TodoCreate):
    id: int
