---
name: git-commit-pr
description: Write a Conventional Commits message and a pull request description (why, what, how tested, impact) from the staged changes or a branch diff. Use when the user says "เขียน commit", "commit message", "เปิด PR", "เขียนคำอธิบาย PR".
---

# Commit message & Pull Request

## Commit message

```
<type>(<scope>): <สิ่งที่เปลี่ยน ในมุมผู้ใช้หรือผลลัพธ์ ไม่เกิน 72 ตัวอักษร>

<ทำไมต้องเปลี่ยน: ปัญหาเดิมคืออะไร>
<เปลี่ยนอะไร: 1-4 บรรทัด>
```

- type: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`
- scope: ชื่อโมดูลหรือหน้าจอ เช่น `estimate`, `download-center`, `db`
- หัวข้อเขียนแบบคำสั่งหรือผลลัพธ์ เช่น "engineers can create repositories" ไม่ใช่ "แก้บั๊ก"
- ถ้ามี breaking change ให้เพิ่มบรรทัด `BREAKING CHANGE: ...`

## Pull request

```markdown
## ทำไม
<ปัญหา / requirement ที่มา>

## เปลี่ยนอะไร
- ...

## ทดสอบอย่างไร
- <คำสั่งที่รันและผล หรือขั้นตอนทดสอบด้วยมือ>

## ผลกระทบ / สิ่งที่ต้องทำตอน deploy
- migration, env ใหม่, สิทธิ์ หรือ "ไม่มี"
```

## ขั้นตอน

1. ดู `git status` และ `git diff --staged` (หรือ `git diff main...HEAD`)
2. ถ้า diff มีหลายเรื่องที่ไม่เกี่ยวกัน ให้แนะนำแยก commit
3. ห้ามใส่ secret, token หรือข้อมูลลูกค้าลงใน commit หรือ PR
4. อย่า commit หรือ push เองถ้าผู้ใช้ไม่ได้สั่ง ให้เสนอข้อความให้ก่อน
