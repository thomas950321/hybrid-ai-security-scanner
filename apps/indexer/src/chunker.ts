import { readFileSync } from "node:fs";

export interface SourceChunk {
  filePath: string;
  language: string;
  symbolName: string | null;
  route: string | null;
  content: string;
}

const MAX_CHUNK_SIZE = 4_000;

const LANGUAGE_MAP: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  go: "go",
  py: "python",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  rb: "ruby",
  php: "php",
  yaml: "yaml",
  yml: "yaml",
  json: "json",
  sql: "sql",
  md: "markdown",
  html: "html",
  css: "css",
  scss: "scss",
  prisma: "prisma",
};

function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return LANGUAGE_MAP[ext] ?? ext;
}

const ROUTE_PATTERNS = [
  /(?:app|router|route|server)\s*\.\s*(get|post|put|patch|delete|head|options)\s*\(\s*['"]([^'"]+)['"]/gi,
  /(?:@Get|@Post|@Put|@Patch|@Delete|@RequestMapping)\(\s*['"]([^'"]+)['"]/g,
  /router\s*\.\s*(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/gi,
  /\.route\s*\(\s*['"]([^'"]+)['"]/g,
];

function extractRoute(content: string, filePath: string): string | null {
  const pathLower = filePath.toLowerCase();

  const pathRouteMatch = pathLower.match(
    /(?:routes?|controllers?|handlers?|pages?|api)\/(.+?)(?:\/index)?\.[a-z]+$/,
  );
  let routeFromPath: string | null = null;
  if (pathRouteMatch?.[1]) {
    routeFromPath = "/" + pathRouteMatch[1].replaceAll(/\[(\w+)\]/g, ":$1");
  }

  for (const pattern of ROUTE_PATTERNS) {
    const match = pattern.exec(content);
    if (match) {
      const route = match[2] ?? match[1];
      if (
        route &&
        !route.startsWith("http") &&
        !route.includes("{") &&
        !route.includes(":")
      ) {
        return route.startsWith("/") ? route : `/${route}`;
      }
    }
  }

  return routeFromPath;
}

function splitIntoChunks(
  filePath: string,
  language: string,
  content: string,
): string[] {
  if (content.length <= MAX_CHUNK_SIZE) {
    return [content];
  }

  const chunks: string[] = [];
  const lines = content.split("\n");
  let currentChunk: string[] = [];
  let currentSize = 0;

  for (const line of lines) {
    if (currentSize + line.length + 1 > MAX_CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push(currentChunk.join("\n"));
      currentChunk = [];
      currentSize = 0;
    }
    currentChunk.push(line);
    currentSize += line.length + 1;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join("\n"));
  }

  return chunks;
}

const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  ".turbo",
  "dist",
  "coverage",
  ".next",
  "build",
  ".cache",
  "pnpm-lock.yaml",
  "pnpm-lock.yml",
]);

export function shouldIncludePath(relativePath: string): boolean {
  const parts = relativePath.split(/[\\/]/);
  return !parts.some((part) => EXCLUDED_DIRS.has(part));
}

export interface ChunkResult {
  filePath: string;
  language: string;
  symbolName: string | null;
  route: string | null;
  content: string;
}

export function chunkFile(
  absolutePath: string,
  relativePath: string,
): ChunkResult[] {
  const language = detectLanguage(relativePath);
  const content = readFileSync(absolutePath, "utf8");
  const fileRoute = extractRoute(content, relativePath);
  const subChunks = splitIntoChunks(relativePath, language, content);

  return subChunks.map((chunkContent, index) => ({
    filePath: relativePath,
    language,
    symbolName: subChunks.length > 1 ? `${relativePath} (part ${index + 1})` : null,
    route: fileRoute,
    content: chunkContent,
  }));
}
