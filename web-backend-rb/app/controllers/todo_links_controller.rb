# TODO 詳細画面からの関連・依存リンクの追加と削除。
class TodoLinksController < ApplicationController
  before_action :set_todo

  def create
    link = @todo.outgoing_links.build(link_params)
    if link.save
      redirect_back fallback_location: todo_path(@todo), notice: "リンクを追加しました。"
    else
      redirect_back fallback_location: todo_path(@todo), alert: link.errors.full_messages.join(" / ")
    end
  end

  def destroy
    link = TodoLink.where(source_id: @todo.id).or(TodoLink.where(target_id: @todo.id))
                   .find(params[:id])
    link.destroy!
    redirect_back fallback_location: todo_path(@todo), notice: "リンクを削除しました。", status: :see_other
  end

  private

  def set_todo
    @todo = Todo.find(params[:todo_id])
  end

  def link_params
    params.require(:todo_link).permit(:target_id, :link_type)
  end
end
