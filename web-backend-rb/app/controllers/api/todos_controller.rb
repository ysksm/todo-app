module Api
  # AI クライアントや将来の SPA から使う JSON API。
  #
  #   GET    /api/todos          一覧（?parent_id= で絞り込み、root=true でルートのみ）
  #   GET    /api/todos/tree     ルートから子孫までネストしたツリー
  #   GET    /api/todos/:id      1 件取得（children を含む）
  #   POST   /api/todos          作成
  #   PATCH  /api/todos/:id      更新（parent_id の付け替え、種類変更も可）
  #   DELETE /api/todos/:id      削除（子孫もまとめて削除）
  class TodosController < BaseController
    before_action :set_todo, only: %i[show update destroy]

    def index
      todos = Todo.ordered
      todos = todos.roots if params[:root] == "true"
      todos = todos.where(parent_id: params[:parent_id]) if params[:parent_id].present?
      render json: todos.map { |t| todo_json(t) }
    end

    def tree
      render json: Todo.tree_roots.map { |t| tree_json(t) }
    end

    def show
      render json: todo_json(@todo).merge(
        children: @todo.children.map { |c| todo_json(c) }
      )
    end

    def create
      todo = Todo.new(todo_params)
      if todo.save
        render json: todo_json(todo), status: :created
      else
        render_errors(todo)
      end
    end

    def update
      if @todo.update(todo_params)
        render json: todo_json(@todo)
      else
        render_errors(@todo)
      end
    end

    def destroy
      @todo.destroy!
      head :no_content
    end

    private

    def set_todo
      @todo = Todo.find(params[:id])
    end

    def todo_params
      params.require(:todo).permit(
        :title, :description, :todo_type, :status, :parent_id,
        :goal, :target_date, :priority,
        :estimated_hours, :estimated_cost, :actual_hours, :actual_cost
      )
    end

    def render_errors(todo)
      render json: { errors: todo.errors.full_messages }, status: :unprocessable_entity
    end

    def todo_json(todo)
      {
        id: todo.id,
        title: todo.title,
        description: todo.description,
        type: todo.todo_type,
        status: todo.status,
        parent_id: todo.parent_id,
        position: todo.position,
        goal: todo.goal,
        target_date: todo.target_date,
        priority: todo.priority,
        estimated_hours: todo.estimated_hours,
        estimated_cost: todo.estimated_cost,
        actual_hours: todo.actual_hours,
        actual_cost: todo.actual_cost,
        created_at: todo.created_at,
        updated_at: todo.updated_at
      }
    end

    def tree_json(todo)
      todo_json(todo).merge(children: todo.children.map { |c| tree_json(c) })
    end
  end
end
