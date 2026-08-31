class TodosController < ApplicationController
  before_action :set_todo, only: %i[show edit update destroy toggle]

  def index
    @roots = Todo.tree_roots
  end

  def show
  end

  def new
    parent = Todo.find_by(id: params[:parent_id])
    default_type = parent ? parent.allowed_child_types.first : "project"
    @todo = Todo.new(parent: parent, todo_type: default_type)
  end

  def edit
  end

  def create
    @todo = Todo.new(todo_params)

    if @todo.save
      redirect_to todos_path, notice: "「#{@todo.title}」を作成しました。"
    else
      render :new, status: :unprocessable_entity
    end
  end

  def update
    if @todo.update(todo_params)
      redirect_to todos_path, notice: "「#{@todo.title}」を更新しました。"
    else
      render :edit, status: :unprocessable_entity
    end
  end

  def destroy
    @todo.destroy!
    redirect_to todos_path, notice: "「#{@todo.title}」を削除しました。", status: :see_other
  end

  # 完了 <-> 未完了 の切り替え
  def toggle
    @todo.update!(status: @todo.done? ? "open" : "done")
    redirect_back fallback_location: todos_path
  end

  private

  def set_todo
    @todo = Todo.find(params[:id])
  end

  def todo_params
    params.require(:todo).permit(:title, :description, :todo_type, :status, :parent_id)
  end
end
