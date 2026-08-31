# ブレスト用のマインドマップ画面。
# /mindmap は全体を、/mindmap/:id はその TODO をルートにした部分ツリーだけを表示する。
class MindmapController < ApplicationController
  def show
    index_by_id = Todo.preloaded_index
    if params[:id]
      @root_todo = index_by_id.fetch(params[:id].to_i) { raise ActiveRecord::RecordNotFound }
      @roots = [ @root_todo ]
    else
      @roots = index_by_id.values.select { |t| t.parent_id.nil? }
    end
  end
end
