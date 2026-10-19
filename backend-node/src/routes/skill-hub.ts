import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { ApiError } from "../errors.js";
import type { CurrentUserService } from "../users.js";

type Target = "claude" | "codex";
type SkillFile = { path: string; content: string };
type Skill = { slug: string; title: string; description: string; category: string; targets: Target[]; files: SkillFile[] };
const SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/;
const isTarget = (value: unknown): value is Target => value === "claude" || value === "codex";
const safePath = (path: string): boolean => Boolean(path) && !path.includes("..")
  // Control characters are exactly what a file name must not carry.
  // eslint-disable-next-line no-control-regex
  && !/^[\\/]|[:\x00-\x1f<>"|?*]/.test(path)
  && path.split(/[\\/]/).every((part) => Boolean(part) && !part.startsWith(".") && !/[. ]$/.test(part)
    && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));

/** Only publish complete skills made from ordinary, bounded text files. Never follow symlinks. */
export async function readSkillCatalog(dir: string): Promise<Skill[]> {
  let raw: unknown;
  try {
    raw = JSON.parse((await readFile(join(dir, "catalog.json"), "utf8")).replace(/^\uFEFF/, ""));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw new ApiError(503, "skill_hub_unavailable", "The Skill Hub catalog could not be read.");
  }
  if (!raw || typeof raw !== "object" || !("skills" in raw) || !Array.isArray(raw.skills)) return [];
  const skills: Skill[] = [];
  for (const entry of raw.skills as unknown[]) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    if (typeof item.slug !== "string" || !SLUG.test(item.slug) || skills.some((skill) => skill.slug === item.slug)
      || typeof item.title !== "string" || typeof item.description !== "string" || typeof item.category !== "string"
      || !Array.isArray(item.targets) || !item.targets.length || !item.targets.every(isTarget)) continue;
    const root = join(dir, item.slug);
    const files: SkillFile[] = [];
    let total = 0;
    const walk = async (relative: string, depth: number): Promise<void> => {
      const entries = await readdir(join(root, relative), { withFileTypes: true });
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        const path = relative ? `${relative}/${entry.name}` : entry.name;
        if (!safePath(path)) continue;
        if (entry.isDirectory() && depth < 2) await walk(path, depth + 1);
        else if (entry.isFile()) {
          const full = join(root, path);
          const info = await lstat(full);
          if (!info.isFile() || info.size > 256 * 1024) continue;
          const bytes = await readFile(full);
          if (bytes.length > 256 * 1024) continue;
          total += bytes.length;
          if (total > 1024 * 1024) throw new Error("Skill exceeds 1 MB");
          files.push({ path, content: new TextDecoder("utf-8", { fatal: true }).decode(bytes) });
        }
      }
    };
    try {
      if (!(await lstat(root)).isDirectory()) continue;
      await walk("", 0);
    } catch { continue; }
    if (!files.some((file) => file.path === "SKILL.md")) continue;
    skills.push({ slug: item.slug, title: item.title, description: item.description, category: item.category,
      targets: [...new Set(item.targets as Target[])], files });
  }
  return skills;
}

export function buildInstallerScript(slug: string, target: Target, files: SkillFile[]): string {
  if (!SLUG.test(slug) || !isTarget(target)) throw new Error("Invalid skill or target");
  if (files.some((file) => !safePath(file.path))) throw new Error("Unsafe skill file path");
  const payload = Buffer.from(JSON.stringify(files), "utf8").toString("base64");
  const command = [
    "$ErrorActionPreference = 'Stop'; try {",
    "$text = [IO.File]::ReadAllText($env:SKILL_HUB_INSTALLER);",
    String.raw`$marker = [regex]::Matches($text, '(?m)^::SKILL-PAYLOAD::\r?$'); if ($marker.Count -eq 0) { throw 'Missing payload' };`,
    "$json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($text.Substring($marker[$marker.Count - 1].Index + $marker[$marker.Count - 1].Length).Trim()));",
    "$files = @($json | ConvertFrom-Json);",
    String.raw`foreach ($file in $files) { $p = [string]$file.path; if (!$p -or $p.Contains('..') -or $p -match '^[\\/]|[:\x00-\x1f<>\x22|?*]' -or @($p -split '[\\/]' | Where-Object { !$_ -or $_.StartsWith('.') -or $_ -match '[. ]$|^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)' }).Count) { throw 'Unsafe skill file path' } };`,
    `if (!$env:USERPROFILE) { throw 'Missing USERPROFILE' }; $dest = Join-Path $env:USERPROFILE '.${target}\\skills\\${slug}';`,
    "if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force };",
    "$null = New-Item -ItemType Directory -Path $dest -Force; $utf8 = New-Object Text.UTF8Encoding($false);",
    "foreach ($file in $files) { $path = Join-Path $dest $file.path; $null = [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($path)); [IO.File]::WriteAllText($path, [string]$file.content, $utf8) };",
    `Write-Host ('Installed ${slug} to ' + $dest + '. Restart ${target === "claude" ? "Claude Code" : "Codex"} to load it.'); exit 0`,
    "} catch { Write-Host ('Installation failed: ' + $_.Exception.Message); exit 1 }",
  ].join(" ");
  return ["@echo off", "setlocal", 'set "SKILL_HUB_INSTALLER=%~f0"',
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "${command}"`,
    'set "SKILL_HUB_EXIT=%ERRORLEVEL%"', "pause", "exit /b %SKILL_HUB_EXIT%", "::SKILL-PAYLOAD::", payload, ""].join("\r\n");
}

export function registerSkillHubRoutes(app: FastifyInstance, users: CurrentUserService): void {
  const dir = process.env.SKILL_HUB_DIR || fileURLToPath(new URL("../../../skill-hub/", import.meta.url));
  const find = async (slug: string): Promise<Skill> => {
    const skill = (await readSkillCatalog(dir)).find((item) => item.slug === slug);
    if (!skill) throw new ApiError(404, "skill_not_found", "The skill was not found.");
    return skill;
  };
  app.get("/api/v1/skill-hub", async (request) => {
    await users.required(request);
    return { skills: (await readSkillCatalog(dir)).map((skill) => ({ ...skill, files: skill.files.map((file) => file.path) })) };
  });
  app.get<{ Params: { slug: string } }>("/api/v1/skill-hub/:slug", async (request) => {
    await users.required(request);
    const skill = await find(request.params.slug);
    return { slug: skill.slug, skillMd: skill.files.find((file) => file.path === "SKILL.md")!.content };
  });
  app.get<{ Params: { slug: string }; Querystring: { target?: string } }>("/api/v1/skill-hub/:slug/install", async (request, reply) => {
    const actor = await users.required(request);
    const target = request.query.target;
    if (!isTarget(target)) throw new ApiError(400, "invalid_target", "Choose claude or codex.");
    const skill = await find(request.params.slug);
    if (!skill.targets.includes(target)) throw new ApiError(400, "invalid_target", "This skill does not support that target.");
    const script = buildInstallerScript(skill.slug, target, skill.files);
    if (request.method !== "HEAD") request.log.info({ actorId: actor.id, slug: skill.slug, target }, "Skill Hub installer downloaded");
    return reply.header("Content-Type", "application/octet-stream")
      .header("Content-Disposition", `attachment; filename="install-${skill.slug}-${target}.cmd"`)
      .header("Cache-Control", "private, no-store").send(script);
  });
}
