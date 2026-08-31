# ブレスト用のマインドマップ画面。ツリー全体を横方向のマップで俯瞰する。
class MindmapController < ApplicationController
  def show
    @roots = Todo.tree_roots
  end
end
