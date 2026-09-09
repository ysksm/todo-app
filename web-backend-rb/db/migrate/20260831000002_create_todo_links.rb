class CreateTodoLinks < ActiveRecord::Migration[8.1]
  def change
    create_table :todo_links do |t|
      t.references :source, null: false, foreign_key: { to_table: :todos }
      t.references :target, null: false, foreign_key: { to_table: :todos }
      t.string :link_type, null: false, default: "relates_to"
      t.timestamps
    end

    add_index :todo_links, %i[source_id target_id link_type], unique: true
  end
end
