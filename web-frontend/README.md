# Todo Frontend

## Commands

```sh
npm run dev
npm run build
npm run lint
npm test
```

The development server proxies `/api` requests to `http://localhost:8000` by default.
Set `VITE_API_BASE_URL` to use a different API origin.

## Architecture

```text
src/
  app/         Composition root and dependency injection
  shared/      Cross-feature infrastructure and configuration
  features/    Feature-specific domain, application, infrastructure, and UI
```

Todo follows this dependency direction:

```text
presentation -> application -> domain
infrastructure -> domain
app -> shared + features
```

Repository interfaces live in each feature's `domain` layer. Their HTTP implementations
live in `infrastructure` and are instantiated only by `app` through DI.

Fetched Todo data, request status, and request errors are managed in the Todo Redux slice.
Dialog text fields dispatch `todoChanged` on blur, so the background list reflects the
draft immediately before the explicit save persists it to the API.

## Views

The Todo feature has two views, switched by the tabs in the page header and stored as
`viewMode` in the Redux slice.

- **List** — flat list rendered depth first, indented by nesting level.
- **Mindmap** — a left-to-right tournament-bracket layout driven entirely by the keyboard.

The mindmap keeps the tree in `domain/entities/todo-tree.ts` (pure functions), turns it into
coordinates in `presentation/hooks/use-mindmap-layout.ts`, and handles keys in
`presentation/hooks/use-mindmap-navigation.ts`. Keyboard focus is a *roving* focus: the
canvas holds the DOM focus and `focusedTodoId` in the store marks the current node, so a
single handler serves every node. See the repository README for the key bindings.

New nodes appear as a client-side draft (`DRAFT_TODO_ID`) and are only sent to the API when
the title is confirmed, because the domain rejects an empty title.

Tests use Vitest and are colocated with the code they cover.
