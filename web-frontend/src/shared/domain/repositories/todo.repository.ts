import type { Todo } from "../entities/todo.entity";

type TodoCreateInput = Omit<Todo, "id">;

interface ToDoRepository {
  addTodo(todo: TodoCreateInput): Promise<Todo>;
  getTodos(): Promise<Todo[]>;
}

export type { ToDoRepository, TodoCreateInput };
