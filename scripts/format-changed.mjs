// Formats only the files this branch changed against its base, so the repository adopts oxfmt file by file
// instead of in one rewrite of every file (owner decision 2026-11-21).
//   bun scripts/format-changed.mjs [base]          rewrite the changed files
//   bun scripts/format-changed.mjs [base] --check  fail if a changed file is not formatted (CI)
import { $ } from "bun";

const args = process.argv.slice(2);
const check = args.includes("--check");
const base = args.find((arg) => !arg.startsWith("--")) ?? "origin/main";
const formattable = /\.(?:[cm]?[jt]sx?|json|css)$/;

const committed = await $`git diff --name-only --diff-filter=ACMR ${base}...HEAD`.text();
const working = check ? "" : await $`git diff --name-only --diff-filter=ACMR HEAD`.text();
const files = [...new Set(`${committed}\n${working}`.split("\n").map((file) => file.trim()))].filter((file) => formattable.test(file));

if (files.length === 0) {
  console.log("No changed files to format.");
} else {
  const { exitCode } = await $`bun x oxfmt ${check ? ["--check"] : []} ${files}`.nothrow();
  process.exitCode = exitCode;
}
