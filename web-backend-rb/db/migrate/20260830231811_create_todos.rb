class CreateTodos < ActiveRecord::Migration[8.1]
  def change
    create_table :todos do |t|
      t.string :title, null: false
      t.text :description
      t.string :todo_type, null: false, default: "task"
      t.string :status, null: false, default: "open"
      t.references :parent, foreign_key: { to_table: :todos }
      t.integer :position, null: false, default: 0

      t.timestamps
    end

    add_index :todos, [ :parent_id, :position ]
  end
end
