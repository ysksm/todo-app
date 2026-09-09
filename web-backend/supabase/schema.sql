-- Supabase に TODO を保存するときのテーブル定義。
-- Supabase ダッシュボードの SQL Editor に貼り付けて実行する。
--
-- id はアプリ側が採番する（JSONL 版と同じく max + 1）ため、
-- identity / sequence は付けない。
-- "position" は PostgreSQL の予約語と重なるので引用符付きで定義する。

create table if not exists public.todos (
    id bigint primary key,
    title text not null,
    description text not null default '',
    status text not null default 'todo',
    type text not null default 'task',
    parent_id bigint,
    "position" integer not null default 0
);

-- RLS を有効にしておく。バックエンドは service_role キー（RLS を通過する）で
-- 接続する想定。anon キーで接続したい場合は下のポリシーを有効にすること
-- （その場合テーブルは誰からでも読み書きできる点に注意）。
alter table public.todos enable row level security;

-- create policy "todos_full_access" on public.todos
--     for all using (true) with check (true);
