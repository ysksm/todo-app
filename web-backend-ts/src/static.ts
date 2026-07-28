import type { IncomingMessage, ServerResponse } from "node:http";
import { ASSETS } from "./assets.generated";

// SPA のエントリポイント。"/" と履歴フォールバックで返す。
const INDEX_PATH = "/index.html";

// Vite がコンテンツハッシュ付きのファイルを吐くディレクトリ。永久キャッシュしてよい。
const IMMUTABLE_PREFIX = "/assets/";

const CACHE_IMMUTABLE = "public, max-age=31536000, immutable";
const CACHE_REVALIDATE = "no-cache";
const CACHE_SHORT = "public, max-age=3600";

const NOT_FOUND = -1;

// path -> ASSETS の添字。scriptc の Map は Buffer を値に持てないため、
// バイト列は添字の揃った配列側に保持する。
const indexByPath = new Map<string, number>();

// base64 の展開は起動時に一度だけ行う（数百 KB でも 1ms 未満）。
const rawBytes: Buffer[] = [];
const gzipBytes: Buffer[] = [];

for (let i = 0; i < ASSETS.length; i += 1) {
  const asset = ASSETS[i];
  indexByPath.set(asset.path, i);
  rawBytes.push(Buffer.from(asset.base64, "base64"));
  gzipBytes.push(Buffer.from(asset.gzipBase64, "base64"));
}

function hexValue(code: number): number {
  if (code >= 48 && code <= 57) {
    return code - 48;
  }
  if (code >= 97 && code <= 102) {
    return code - 87;
  }
  if (code >= 65 && code <= 70) {
    return code - 55;
  }
  return NOT_FOUND;
}

// %XX を復号する。decodeURIComponent と違い、壊れた入力でも例外を投げずに元の文字を残す。
// 連続する %XX はまとめて復号するのでマルチバイト文字も正しく戻る。
function percentDecode(input: string): string {
  if (input.indexOf("%") < 0) {
    return input;
  }
  let out = "";
  let hex = "";
  let i = 0;
  while (i < input.length) {
    if (input.charCodeAt(i) === 37 && i + 2 < input.length) {
      const hi = hexValue(input.charCodeAt(i + 1));
      const lo = hexValue(input.charCodeAt(i + 2));
      if (hi >= 0 && lo >= 0) {
        hex += input.slice(i + 1, i + 3);
        i += 3;
        continue;
      }
    }
    if (hex !== "") {
      out += Buffer.from(hex, "hex").toString("utf8");
      hex = "";
    }
    out += input.slice(i, i + 1);
    i += 1;
  }
  if (hex !== "") {
    out += Buffer.from(hex, "hex").toString("utf8");
  }
  return out;
}

// URL からクエリとフラグメントを落とし、"." / ".." を解決した絶対パスにする。
export function normalizePath(url: string): string {
  let path = url;

  const query = path.indexOf("?");
  if (query >= 0) {
    path = path.slice(0, query);
  }
  const fragment = path.indexOf("#");
  if (fragment >= 0) {
    path = path.slice(0, fragment);
  }

  path = percentDecode(path);

  const segments: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (segments.length > 0) {
        segments.pop();
      }
      continue;
    }
    segments.push(segment);
  }

  const normalized = "/" + segments.join("/");
  // 末尾スラッシュはディレクトリ指定として残す。
  if (path.endsWith("/") && normalized !== "/") {
    return normalized + "/";
  }
  return normalized;
}

// 拡張子付き（= 実ファイル狙い）のリクエストかどうか。SPA フォールバックの判定に使う。
function looksLikeFile(path: string): boolean {
  const lastSlash = path.lastIndexOf("/");
  return path.slice(lastSlash + 1).indexOf(".") >= 0;
}

function indexOfPath(path: string): number {
  const found = indexByPath.get(path);
  if (found !== undefined) {
    return found;
  }
  return NOT_FOUND;
}

function lookup(path: string): number {
  if (path === "/") {
    return indexOfPath(INDEX_PATH);
  }
  const direct = indexOfPath(path);
  if (direct !== NOT_FOUND) {
    return direct;
  }
  if (path.endsWith("/")) {
    return indexOfPath(path + "index.html");
  }
  return NOT_FOUND;
}

function cacheControlFor(path: string): string {
  if (path === INDEX_PATH) {
    return CACHE_REVALIDATE;
  }
  if (path.startsWith(IMMUTABLE_PREFIX)) {
    return CACHE_IMMUTABLE;
  }
  return CACHE_SHORT;
}

function headerValue(req: IncomingMessage, name: string): string {
  const value = req.headers[name];
  if (typeof value === "string") {
    return value;
  }
  return "";
}

// Accept-Encoding: "gzip", "gzip;q=0.5", "br, gzip;q=0", "*" などを解釈する。
// q=0 は明示的な拒否。"gzip" の指定は "*" より優先される。
function acceptsGzip(req: IncomingMessage): boolean {
  const header = headerValue(req, "accept-encoding").toLowerCase();
  if (header === "") {
    return false;
  }
  let wildcardQ = -1;
  for (const token of header.split(",")) {
    const parts = token.split(";");
    const coding = parts[0].trim();
    if (coding !== "gzip" && coding !== "*") {
      continue;
    }
    let q = 1;
    for (let i = 1; i < parts.length; i += 1) {
      const param = parts[i].trim();
      if (param.startsWith("q=")) {
        const parsed = Number(param.slice(2));
        q = Number.isNaN(parsed) ? 1 : parsed;
      }
    }
    if (coding === "gzip") {
      return q > 0;
    }
    wildcardQ = q;
  }
  return wildcardQ > 0;
}

// If-None-Match は "*" か、カンマ区切りの ETag 列。W/ 接頭辞は無視して比較する。
function isNoneMatch(req: IncomingMessage, etag: string): boolean {
  const header = headerValue(req, "if-none-match");
  if (header === "") {
    return false;
  }
  if (header.trim() === "*") {
    return true;
  }
  for (const candidate of header.split(",")) {
    let value = candidate.trim();
    if (value.startsWith("W/")) {
      value = value.slice(2);
    }
    if (value === etag) {
      return true;
    }
  }
  return false;
}

function sendAsset(
  req: IncomingMessage,
  res: ServerResponse,
  index: number,
  cacheControl: string,
): void {
  const asset = ASSETS[index];
  const hasGzip = asset.gzipSize > 0;
  const useGzip = hasGzip && acceptsGzip(req);
  const etag = useGzip ? asset.gzipEtag : asset.etag;

  res.setHeader("Content-Type", asset.contentType);
  res.setHeader("Cache-Control", cacheControl);
  res.setHeader("ETag", etag);
  if (hasGzip) {
    // gzip を返さなかった場合もキャッシュの取り違えを防ぐために付ける。
    res.setHeader("Vary", "Accept-Encoding");
  }

  if (isNoneMatch(req, etag)) {
    res.writeHead(304);
    res.end();
    return;
  }

  const body = useGzip ? gzipBytes[index] : rawBytes[index];
  if (useGzip) {
    res.setHeader("Content-Encoding", "gzip");
  }
  res.setHeader("Content-Length", body.length);

  if (req.method === "HEAD") {
    res.writeHead(200);
    res.end();
    return;
  }

  res.writeHead(200);
  res.end(body);
}

function sendText(res: ServerResponse, status: number, text: string, allow: string): void {
  const body = Buffer.from(text, "utf8");
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Length", body.length);
  if (allow !== "") {
    res.setHeader("Allow", allow);
  }
  res.writeHead(status);
  res.end(body);
}

// 静的コンテンツとして処理できたら true。API ルーターより後に呼ぶこと。
export function serveStatic(req: IncomingMessage, res: ServerResponse, path: string): boolean {
  if (ASSETS.length === 0) {
    return false;
  }

  const method = req.method;
  if (method !== "GET" && method !== "HEAD") {
    // 静的ファイルが実在するパスへの GET/HEAD 以外だけを 405 にする。
    if (lookup(path) === NOT_FOUND) {
      return false;
    }
    sendText(res, 405, "405 Method Not Allowed", "GET, HEAD");
    return true;
  }

  const index = lookup(path);
  if (index !== NOT_FOUND) {
    sendAsset(req, res, index, cacheControlFor(ASSETS[index].path));
    return true;
  }

  // SPA の履歴フォールバック。拡張子付き（アセット狙い）のパスは 404 のままにして、
  // 消えた JS/CSS が index.html として返る事故を防ぐ。
  const indexHtml = indexOfPath(INDEX_PATH);
  if (indexHtml !== NOT_FOUND && !looksLikeFile(path)) {
    sendAsset(req, res, indexHtml, CACHE_REVALIDATE);
    return true;
  }

  sendText(res, 404, "404 Not Found", "");
  return true;
}

export const assetCount = ASSETS.length;
