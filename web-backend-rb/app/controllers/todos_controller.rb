class TodosController < ApplicationController
  before_action :set_todo, only: %i[show edit update destroy toggle advance move set_priority]

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
      if mindmap_inline?
        # マインドマップのポップオーバーからの追加。画面遷移せずノードを追記する。
        render :create_mindmap, formats: :turbo_stream
      else
        redirect_to return_to_path || todos_path, notice: "「#{@todo.title}」を作成しました。"
      end
    elsif mindmap_inline?
      render turbo_stream: turbo_stream.replace(
        "mm-add-#{@todo.parent_id || 'root'}",
        partial: "mindmap/add_form",
        locals: { parent: @todo.parent, todo: @todo, open: true }
      ), status: :unprocessable_entity
    else
      render :new, status: :unprocessable_entity
    end
  end

  def update
    if @todo.update(todo_params)
      redirect_to return_to_path || todos_path, notice: "「#{@todo.title}」を更新しました。"
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

  # 状態を 1 つ進める（未着手 → 進行中 → 完了）
  def advance
    @todo.advance_status!
    redirect_back fallback_location: work_path
  end

  # 同じ親の中で並び順を上下させる
  def move
    @todo.move!(params[:direction] == "up" ? :up : :down)
    redirect_back fallback_location: work_path
  end

  # 作業画面からの優先度のワンクリック変更
  def set_priority
    if Todo::PRIORITIES.include?(params[:priority])
      @todo.update!(priority: params[:priority])
    end
    redirect_back fallback_location: work_path
  end

  private

  # 呼び出し元の画面（マインドマップ・ブラウズなど）に戻るための ?return_to= パス
  def return_to_path
    helpers.safe_internal_path(params[:return_to])
  end

  def mindmap_inline?
    params[:inline] == "mindmap"
  end

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
end
