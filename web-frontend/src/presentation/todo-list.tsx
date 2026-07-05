import type { Todo } from "../shared/domain/entities/todo.entity";

type TodoListProps = {
  todos: Todo[];
};

function TodoList({ todos }: TodoListProps) {
  return (
    <div>
      <h1>Todo List</h1>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>{todo.title}</li>
        ))}
      </ul>
    </div>
  );
}

export default TodoList;
