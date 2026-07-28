import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { serveStatic, assetCount, normalizePath } from "./static";

const PORT = 8000;
const API_PREFIX = "/api/";

type TodoCreate = {
  title: string;
  description: string;
  completed: boolean;
};

type Todo = {
  id: number;
  title: string;
  description: string;
  completed: boolean;
};

const todos = new Map<number, Todo>();
let nextId = 1;

function listTodos(): Todo[] {
  const result: Todo[] = [];
  for (const todo of todos.values()) {
    result.push(todo);
  }
  return result;
}

function createTodo(input: TodoCreate): Todo {
  const todo: Todo = {
    id: nextId,
    title: input.title,
    description: input.description,
    completed: input.completed,
  };
  todos.set(nextId, todo);
  nextId += 1;
  return todo;
}

// pydantic の TodoCreate と同じく description / completed は省略可能。
// scriptc のキャストは実行時に検証され、必須フィールドが欠けると例外になる。
function parseTodoCreate(body: string): TodoCreate {
  const required = JSON.parse(body) as { title: string };

  let description = "";
  try {
    description = (JSON.parse(body) as { description: string }).description;
  } catch (error) {
    description = "";
  }

  let completed = false;
  try {
    completed = (JSON.parse(body) as { completed: boolean }).completed;
  } catch (error) {
    completed = false;
  }

  return { title: required.title, description: description, completed: completed };
}

function sendJson(res: ServerResponse, status: number, payload: string): void {
  const body = Buffer.from(payload, "utf8");
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": body.length,
  });
  res.end(body);
}

// API ルーター。処理したら true を返す。
function handleApi(req: IncomingMessage, res: ServerResponse, path: string, body: string): boolean {
  if (path === "/api/todos") {
    const method = req.method;
    if (method === "GET") {
      sendJson(res, 200, JSON.stringify(listTodos()));
      return true;
    }
    if (method === "POST") {
      try {
        const todo = createTodo(parseTodoCreate(body));
        sendJson(res, 200, JSON.stringify(todo));
      } catch (error) {
        sendJson(res, 422, '{"detail":"Invalid request body"}');
      }
      return true;
    }
    sendJson(res, 405, '{"detail":"Method Not Allowed"}');
    return true;
  }
  return false;
}

function handleRequest(req: IncomingMessage, res: ServerResponse, body: string): void {
  const url = req.url;
  if (url === undefined) {
    sendJson(res, 400, '{"detail":"Bad Request"}');
    return;
  }

  const path = normalizePath(url);

  // /api/* は必ず API が受け持つ。静的ハンドラに落ちて index.html が返らないようにする。
  if (path === "/api" || path.startsWith(API_PREFIX)) {
    if (!handleApi(req, res, path, body)) {
      sendJson(res, 404, '{"detail":"Not Found"}');
    }
    return;
  }

  if (serveStatic(req, res, path)) {
    return;
  }

  sendJson(res, 404, '{"detail":"Not Found"}');
}

function main(): void {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
    });
    req.on("end", () => {
      handleRequest(req, res, body);
    });
  });

  server.on("error", (error: Error) => {
    console.error(`failed to start server on port ${PORT}: ${error.message}`);
    process.exit(1);
  });

  server.listen(PORT, () => {
    console.log(`TODO API listening on http://127.0.0.1:${PORT}`);
    console.log(`embedded static assets: ${assetCount}`);
  });
}

main();
