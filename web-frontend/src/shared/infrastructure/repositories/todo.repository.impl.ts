import type { Todo } from '../../domain/entities/todo.entity';
import type { ToDoRepository, TodoCreateInput } from '../../domain/repositories/todo.repository';


class ToDoRepositoryImpl implements ToDoRepository {
    async addTodo(todo: TodoCreateInput): Promise<Todo> {
        const response = await fetch('/api/todos', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(todo)
        });
        if (!response.ok) {
            throw new Error(`Failed to add todo: ${response.status}`);
        }
        return response.json();
    }
    async getTodos(): Promise<Todo[]> {
        const response = await fetch('/api/todos');
        if (!response.ok) {
            throw new Error(`Failed to fetch todos: ${response.status}`);
        }
        return response.json();
    }
}

export { ToDoRepositoryImpl };
