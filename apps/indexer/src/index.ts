import { readdirSync, statSync, existsSync } from "node:fs";
import { resolve, relative, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { closePool } from "@hybrid/db";
import { insertCodeChunks } from "@hybrid/db";
import { loadAppConfig } from "@hybrid/config";

import { chunkFile, shouldIncludePath } from "./chunker.js";
import { generateEmbeddings } from "./embedder.js";

function walkDir(dir: string, baseDir: string): string[] {
  const files: string[] = [];

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = resolve(dir, entry.name);

      if (entry.isDirectory()) {
        const relPath = relative(baseDir, fullPath);
        if (shouldIncludePath(relPath)) {
          files.push(...walkDir(fullPath, baseDir));
        }
      } else if (entry.isFile()) {
        const relPath = relative(baseDir, fullPath);
        if (shouldIncludePath(relPath)) {
          files.push(fullPath);
        }
      }
    }
  } catch {
    // skip unreadable directories
  }

  return files;
}

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg",
  ".ttf", ".woff", ".woff2", ".eot",
  ".zip", ".tar", ".gz", ".rar",
  ".exe", ".dll", ".so", ".dylib",
  ".wasm",
  ".o", ".a", ".lib",
  ".mp3", ".mp4", ".avi", ".mov",
  ".pdf",
  ".ico",
]);

function isTextFile(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase();
  if (!ext) {
    return false;
  }
  return !BINARY_EXTENSIONS.has(`.${ext}`);
}

export interface IndexerOptions {
  repoPath?: string;
  batchSize?: number;
  clearExisting?: boolean;
}

function findProjectRoot(from: string): string {
  let current = resolve(from);
  while (current !== dirname(current)) {
    if (existsSync(resolve(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    current = dirname(current);
  }
  return from;
}

export async function indexRepository(
  options: IndexerOptions = {},
): Promise<{ totalFiles: number; totalChunks: number }> {
  const repoPath = resolve(options.repoPath ?? findProjectRoot(process.cwd()));
  const batchSize = options.batchSize ?? 20;

  console.log(`Indexing repository: ${repoPath}`);

  const sourceFiles = walkDir(repoPath, repoPath)
    .filter((f) => isTextFile(f))
    .filter((f) => {
      const ext = f.split(".").pop()?.toLowerCase();
      const textExtensions = [
        "ts", "tsx", "js", "jsx", "json", "md", "yaml", "yml",
        "go", "py", "rs", "java", "kt", "swift", "rb", "php",
        "sql", "html", "css", "scss", "prisma", "toml", "xml",
        "sh", "bash", "zsh", "ps1", "bat", "cmd",
        "env", "gitignore", "dockerfile", "conf", "cfg", "ini",
        "gradle", "properties",
      ];
      return ext ? textExtensions.includes(ext) : false;
    });

  console.log(`Found ${sourceFiles.length} source files to index.`);

  if (options.clearExisting) {
    const { getPool } = await import("@hybrid/db");
    const pool = getPool();
    await pool.query("DELETE FROM code_chunks");
    console.log("Cleared existing code chunks.");
  }

  let totalChunks = 0;

  for (let i = 0; i < sourceFiles.length; i += batchSize) {
    const batch = sourceFiles.slice(i, i + batchSize);
    const allChunks = batch.flatMap((filePath) =>
      chunkFile(filePath, relative(repoPath, filePath)),
    );

    if (allChunks.length === 0) {
      continue;
    }

    const texts = allChunks.map((c) => c.content);
    let embeddings: number[][] = [];

    try {
      embeddings = await generateEmbeddings(texts);
    } catch (error) {
      console.log(
        "  Embedding generation failed, storing chunks without vectors.",
      );
    }

    const dbRecords: Array<{
      id: string;
      repositoryPath: string;
      filePath: string;
      route: string | null;
      symbolName: string | null;
      language: string;
      content: string;
      embedding: number[];
    }> = [];

    for (let index = 0; index < allChunks.length; index++) {
      const emb = embeddings[index];
      if (!emb || emb.length === 0) {
        continue;
      }
      dbRecords.push({
        id: randomUUID(),
        repositoryPath: repoPath,
        filePath: allChunks[index]!.filePath,
        route: allChunks[index]!.route,
        symbolName: allChunks[index]!.symbolName,
        language: allChunks[index]!.language,
        content: allChunks[index]!.content,
        embedding: emb,
      });
    }

    if (dbRecords.length > 0) {
      await insertCodeChunks(dbRecords);
    }
    totalChunks += allChunks.length;

    const progress = Math.min(i + batchSize, sourceFiles.length);
    console.log(
      `  Indexed ${progress}/${sourceFiles.length} files (${totalChunks} chunks)`,
    );
  }

  console.log(`Done. ${totalChunks} chunks indexed from ${sourceFiles.length} files.`);
  return { totalFiles: sourceFiles.length, totalChunks };
}

async function main() {
  loadAppConfig();
  const args = process.argv.slice(2);
  const repoPath =
    args.find((arg) => !arg.startsWith("--")) ??
    findProjectRoot(process.cwd());

  await indexRepository({
    repoPath,
    clearExisting: args.includes("--clear"),
  });

  await closePool();
}

main().catch((error) => {
  console.error("Indexer failed:", error);
  process.exit(1);
});
