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

Tests use Vitest and are colocated with the code they cover.
