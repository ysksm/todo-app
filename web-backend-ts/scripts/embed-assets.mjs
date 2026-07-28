#!/usr/bin/env node
// 静的コンテンツを TypeScript のソースに変換して、バイナリに埋め込めるようにする。
// 実行時にファイルシステムを一切読まないので、生成されたバイナリ 1 つで配布できる。
//
//   node scripts/embed-assets.mjs [srcDir] [outFile] [--no-gzip]
//
// 既定値: srcDir = ../web-frontend/dist, outFile = src/assets.generated.ts
//
// --no-gzip: gzip 変種を埋め込まない。Content-Encoding: gzip は返さなくなるが
//            バイナリは小さくなる。
// srcDir が無い場合は空のモジュールを生成する（API だけのバイナリになる）。

import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, "..");

const args = process.argv.slice(2);
const noGzip = args.includes("--no-gzip");
const positional = args.filter((a) => !a.startsWith("--"));
const srcDir = resolve(PROJECT_ROOT, positional[0] ?? "../web-frontend/dist");
const outFile = resolve(PROJECT_ROOT, positional[1] ?? "src/assets.generated.ts");

// text/* と一部の構造化テキストには charset を付ける（ブラウザの文字化け防止）。
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".wasm": "application/wasm",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".webmanifest": "application/manifest+json",
};

// gzip を事前計算しておく対象（バイナリ画像などは再圧縮しても縮まらない）。
const COMPRESSIBLE = /^(text\/|application\/(json|xml|javascript|manifest\+json)|image\/svg\+xml)/;

// gzip 変種を持つ最小サイズと、最低限必要な圧縮率。
const GZIP_MIN_BYTES = 1024;
const GZIP_MIN_RATIO = 0.9;

function extname(name) {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // ドットファイルは配信しない
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function toUrlPath(file) {
  return "/" + relative(srcDir, file).split(sep).join("/");
}

function tsString(value) {
  return JSON.stringify(value);
}

const srcExists = statSync(srcDir, { throwIfNoEntry: false })?.isDirectory() === true;
if (!srcExists) {
  console.warn(`embed-assets: 警告 ディレクトリが見つかりません: ${srcDir}`);
  console.warn(`  静的コンテンツなし（API のみ）としてビルドします。`);
  console.warn(`  配信したい場合は先に: cd ../web-frontend && npm install && npx vite build`);
}

const files = srcExists ? walk(srcDir).sort() : [];
if (srcExists && files.length === 0) {
  console.warn(`embed-assets: 警告 ${srcDir} にファイルがありません`);
}

const assets = [];
let rawTotal = 0;
let embeddedTotal = 0;

for (const file of files) {
  const bytes = readFileSync(file);
  const urlPath = toUrlPath(file);
  const ext = extname(file);
  const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
  const etag = `"${createHash("sha256").update(bytes).digest("hex").slice(0, 32)}"`;

  let gzipBase64 = "";
  let gzipEtag = "";
  let gzipSize = 0;
  if (!noGzip && COMPRESSIBLE.test(contentType) && bytes.length >= GZIP_MIN_BYTES) {
    const gz = gzipSync(bytes, { level: 9 });
    if (gz.length < bytes.length * GZIP_MIN_RATIO) {
      gzipBase64 = gz.toString("base64");
      gzipEtag = `${etag.slice(0, -1)}-gz"`;
      gzipSize = gz.length;
    }
  }

  assets.push({
    path: urlPath,
    contentType,
    etag,
    size: bytes.length,
    base64: bytes.toString("base64"),
    gzipEtag,
    gzipSize,
    gzipBase64,
  });

  rawTotal += bytes.length;
  embeddedTotal += bytes.length + gzipSize;
}

const lines = [];
lines.push("// scripts/embed-assets.mjs が生成したファイルです。直接編集しないでください。");
lines.push(`// 生成元: ${relative(PROJECT_ROOT, srcDir).split(sep).join("/")} (${assets.length} files)`);
lines.push("//");
lines.push("// 静的コンテンツを base64 文字列としてソースに持つことで、コンパイル後の");
lines.push("// ネイティブバイナリに埋め込む。実行時にファイルを読まないため単体で配布できる。");
lines.push("");
lines.push("export type EmbeddedAsset = {");
lines.push("  path: string;");
lines.push("  contentType: string;");
lines.push("  etag: string;");
lines.push("  size: number;");
lines.push("  base64: string;");
lines.push("  // gzip 変種。持たない場合は gzipSize === 0。");
lines.push("  gzipEtag: string;");
lines.push("  gzipSize: number;");
lines.push("  gzipBase64: string;");
lines.push("};");
lines.push("");
lines.push("export const ASSETS: EmbeddedAsset[] = [");
for (const a of assets) {
  lines.push("  {");
  lines.push(`    path: ${tsString(a.path)},`);
  lines.push(`    contentType: ${tsString(a.contentType)},`);
  lines.push(`    etag: ${tsString(a.etag)},`);
  lines.push(`    size: ${a.size},`);
  lines.push(`    base64: ${tsString(a.base64)},`);
  lines.push(`    gzipEtag: ${tsString(a.gzipEtag)},`);
  lines.push(`    gzipSize: ${a.gzipSize},`);
  lines.push(`    gzipBase64: ${tsString(a.gzipBase64)},`);
  lines.push("  },");
}
lines.push("];");
lines.push("");

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, lines.join("\n"), "utf8");

const kib = (n) => `${(n / 1024).toFixed(1)} KiB`;
console.log(`embed-assets: ${assets.length} files -> ${relative(PROJECT_ROOT, outFile).split(sep).join("/")}`);
for (const a of assets) {
  const gz = a.gzipSize > 0 ? ` (gzip ${kib(a.gzipSize)})` : "";
  console.log(`  ${a.path.padEnd(34)} ${kib(a.size).padStart(10)}${gz}`);
}
console.log(`  ---`);
console.log(`  raw ${kib(rawTotal)} / embedded ${kib(embeddedTotal)} (gzip 変種込み)`);
