# TODO 同士の親子以外のつながり。source から target へ向きを持つ。
#   relates_to: 関連（緩いつながり。向きに意味はない）
#   depends_on: 依存（source は target が終わらないと着手できない）
class TodoLink < ApplicationRecord
  LINK_TYPES = %w[relates_to depends_on].freeze

  belongs_to :source, class_name: "Todo"
  belongs_to :target, class_name: "Todo"

  validates :link_type, inclusion: { in: LINK_TYPES }
  validates :target_id, uniqueness: { scope: %i[source_id link_type], message: "へのリンクは既にあります" }
  validate :target_must_not_be_source
  validate :reverse_link_must_not_exist

  private

  def target_must_not_be_source
    errors.add(:target_id, "に自分自身は指定できません") if source_id == target_id
  end

  # 同じ種類の逆向きリンクは重複（relates_to）または直接循環（depends_on）なので禁止
  def reverse_link_must_not_exist
    return if source_id.nil? || target_id.nil?
    return unless TodoLink.where(source_id: target_id, target_id: source_id, link_type: link_type)
                          .where.not(id: id).exists?

    message = link_type == "depends_on" ? "とは互いに依存し合う関係にできません" : "とは既に関連があります"
    errors.add(:target_id, message)
  end
end
