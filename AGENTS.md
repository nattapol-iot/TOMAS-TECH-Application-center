# Project Context & Agent Rules — IoT Team application

Shared by Claude Code (via `CLAUDE.md` → `@AGENTS.md`) and Codex. This is the single entry point for project rules and the module index.

## Shared execution rules — Codex and Claude Code

- Both agents follow the same task scope and workflow: inspect → implement → verify → report. Do not stop at a plan or ask "Should I continue?" when the next step is already authorized.
- A request to fix, update or implement authorizes the necessary local reads, edits and targeted checks. Continue through recoverable failures; fix issues in the requested scope and report the evidence.
- Carry the user's explicit authorization through the current task. If the user asks to build, commit or push, complete those steps without asking again. Check the remote and integrate new changes safely before a normal push; never force-push or discard someone else's work without explicit authorization.
- A local implementation request alone does not authorize pushing, deploying or changing a shared database. When a requested push triggers the repository's deployment workflow, mention that consequence and proceed within the authorization already given. Do not invent additional release approval steps.
- Ask only when necessary information or credentials are missing, a decision materially changes scope, or a destructive/irreversible action has not been authorized. State the concrete blocker and its source. Never request passwords in chat or put secrets in context files.
- Check branch, git status and current source before editing. Preserve unrelated changes and coordinate overlapping files with other active sessions. Commit only the work covered by the request.
- Use the available tools directly for routine work; do not ask the user to run commands that the agent can run. If a tool is unavailable or an approval is denied, explain the actual limitation and use an authorized alternative; do not bypass tool permissions.
- Keep progress updates short and in Thai. Finish with what changed, verification results, remaining limitations and whether changes are local, committed or pushed. Do not claim deployment or business acceptance without checking it.
- For unfinished work, maintain a concise HANDOFF.md with the task, relevant files, completed checks, remaining steps and blockers. A new session must verify the handoff against current Git/source state before continuing.

These project rules guide both agents; they do not override host/system policies or grant tools that a session does not have. Claude permission dialogs are controlled separately by Claude's runtime settings.

## Project context — read on demand

- Start here, then open only the module and API/function relevant to the task from the index below. Do not preload the full documentation tree.
- For cross-module changes, read `docs/context/ARCHITECTURE.md`. Follow `docs/context/WORKFLOW.md` for targeted checks and regenerating context after source changes.
- Context maps source code; dated release/audit documents do not prove the current runtime state. Verify code and runtime when needed.

## Resource rules (this machine has 15 GB RAM — keep memory low)

- Do NOT spawn subagents, parallel agents, or workflows unless the user explicitly asks. Work as a single agent.
- Do NOT create git worktrees unless the user explicitly asks. Work on the current checkout. (A worktree = a second `node_modules`, a second dev server, a second `tsc`.)
- Never use watch mode (`tsc --watch`, `vite --watch`, `vitest --watch`, `nodemon`, …). Run once and let the process exit.
- Heavy commands run one at a time, never in parallel: `npx tsc --noEmit`, `npm run build`, `npm test`, `npm run lint`.
- Check `package.json` for current test scripts; `npm test` runs lint, typecheck and root tests, not the build. Run only checks relevant to the task.
- Typecheck/build/test once at the END of a task, after all edits are done — not after every file change.
- Stop temporary verification servers and background processes you started. Preserve services that were already running; if authorized work requires a temporary stop, restore the previous service configuration and verify it responds before finishing. Leave a server running when the user explicitly requested it.
- If a dev server is needed to verify a change, reuse the one already running (see `.claude/launch.json`, port 3000) instead of starting another.
- Prefer targeted checks over whole-project ones: run a single test file, lint only changed files.
- Do not open the Browser/computer-use tools unless the change actually needs visual verification.

<!-- PROJECT-CONTEXT:START -->
## Project Context — IoT Team Center

จุดเริ่มต้นเดียวสำหรับ AI · Source snapshot: `32e38249` · เอกสารอ้างโค้ด ไม่ใช่สถานะ live

## อ่านแบบประหยัด Context

1. อ่านกฎด้านบน แล้วเลือกโมดูลด้านล่างเพียงหนึ่งเรื่อง
2. เปิด module card แล้วเลือก API operation / ชื่อฟังก์ชันที่เกี่ยวข้อง
3. อ่าน source เฉพาะ handler และ helper ที่เรียก พร้อม test ของเส้นทางนั้น
4. เปิด Architecture เมื่อแก้ข้ามระบบ; เปิด Schema เมื่อแก้ SQL; อย่าโหลด docs ทั้งโฟลเดอร์
5. เมื่อเปลี่ยนโค้ด อัปเดต context ด้วยคำสั่งใน Change guide

## สารบัญฟีเจอร์

| Module | ขอบเขต |
|---|---|
| [Application shell / Login / Profile](docs/context/modules/shell.md) | เมนู ภาษา session bootstrap และโปรไฟล์ |
| [Dashboard / Executive](docs/context/modules/dashboard.md) | ภาพรวมผู้บริหารและข้อมูลทีม |
| [Inquiry / Sales intake](docs/context/modules/inquiry.md) | รับงาน ลูกค้า end user และส่งต่อสำรวจ |
| [Site Visit / My Assignments](docs/context/modules/site-visit.md) | นัดหมาย มอบหมาย สำรวจ รายงาน และอนุมัติ |
| [Estimate Cost](docs/context/modules/estimate.md) | สร้าง revision รายการต้นทุน ค่าใช้จ่าย validation และ workflow |
| [Copy Estimate / Assignment queue](docs/context/modules/estimate-copy.md) | คัดลอกหลาย ledger และแสดงงานที่ยังไม่เริ่มใน My Work |
| [ERP Summary / Excel](docs/context/modules/estimate-erp.md) | จัดหมวด ERP สรุปยอด export และ import workbook |
| [Labor Package / Rate Master](docs/context/modules/labor.md) | เซฟและใช้ชุดค่าแรง version rate และนำกลับมาใช้ |
| [Module Templates](docs/context/modules/templates.md) | สร้าง template โมดูลและนำเข้า estimate |
| [Price Library / Supplier Quotation](docs/context/modules/pricing.md) | ราคาย้อนหลัง ใบเสนอราคา PDF parser และติดตามราคาที่ขาด |
| [Projects / Project Documents](docs/context/modules/projects.md) | ทะเบียนโครงการ end user และรับส่งเอกสารจาก inquiry/site visit |
| [Schedule / Resource / My Work](docs/context/modules/planning.md) | แผนงาน timeline กำลังคน lifecycle งานและคำขอปรับวัน |
| [BOM / PR / PO / Approvals](docs/context/modules/procurement.md) | จัดซื้อ อนุมัติ และประวัติ PR |
| [Inventory / Receiving / Issues](docs/context/modules/inventory.md) | รับของ เบิกของ stock ledger และการควบคุมยอด |
| [Sign Drawing / Documents / Stamps](docs/context/modules/signing.md) | ลงนาม inbox ลายเซ็น ตราบริษัท และตรวจ certificate |
| [Reports / Inspection / Report Templates](docs/context/modules/reports.md) | แก้รายงาน workflow หลักฐาน ส่งออก PDF/PPTX และ customer acknowledgment |
| [Knowledge Hub](docs/context/modules/knowledge.md) | บทความ เอกสาร collaboration workflow และ sales materials |
| [KPI / Growth / Team Activity](docs/context/modules/performance.md) | ประเมิน performance หลักฐาน insights และ activity |
| [Support / Employee Manual](docs/context/modules/support.md) | แจ้งปัญหา ticket การตอบรับ และคู่มือ |
| [Master Data / Customers / Admin](docs/context/modules/master.md) | ลูกค้า supplier พนักงาน role audit และ settings |
| [Platform / Health / Storage](docs/context/modules/platform.md) | config database migration authentication และ document storage |

## เอกสารส่วนกลาง — เปิดตามงาน

- [Architecture / boundaries](docs/context/ARCHITECTURE.md)
- [Change workflow / tests / update context](docs/context/WORKFLOW.md)
- [Schema / migrations](docs/context/SCHEMA.md)
- [Analysis and known limits](docs/context/ANALYSIS.md)
- [เอกสารเดิม: specs, design, audit, releases](docs/README.md) — ใช้เป็นข้อมูลเฉพาะเรื่องตามวันที่ ไม่อ่านทั้งหมดตั้งแต่เริ่ม

## ทางลัดปัญหาที่พบบ่อย

- Copy Estimate → estimate-copy → POST copy handler + estimate-copy-plan
- Assign แล้วไม่เห็น My Work → estimate-copy → assignments-read + estimate-assignment-queue
- Labor ที่บันทึกไว้ → labor → LaborPackageMaster + labor-packages
- ERP / Summary cost / Export Excel → estimate-erp → estimate-erp API + lib/erp-estimate-workbook.ts
- เลือก Template ไม่ได้ → templates และ estimate → apply-template + tests/estimate-template-selection.test.mjs
- Sign Drawing → signing และ planning → drawing-workflow + resource-tasks
- Supplier PDF / upload / ราคา → pricing → supplier-quotations + pdf-parser/main.py

## Contract

Node API ที่ใช้อ้างอิงอยู่ backend-node/; backend/ (.NET), backend-php/ และ worker/ เป็นเส้นทางอีกชุด อย่าแก้โดยสมมติว่าเป็น runtime เดียวกัน. Permission, role, scope และสถานะงานต้องตรวจในโค้ดเส้นทางจริง; requirement ที่ผู้ใช้เคยขอไม่ได้ยืนยันว่า implemented แล้ว.

Generated inventory: 21 modules, 56 route files, 328 literal HTTP operations. ไฟล์ที่ใช้ร่วมกันอาจปรากฏหลาย module; endpoint extraction ไม่ได้แทนการตรวจ runtime.
<!-- PROJECT-CONTEXT:END -->
