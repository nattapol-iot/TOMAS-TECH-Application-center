# Operations

Updated: 2026-09-10. Owner: Release/Operations.

- [Release control](RELEASE_CONTROL.md): candidate, artifact, schema และวิธีสืบ feature regression
- [Production deployment เดิม](../PRODUCTION_DEPLOYMENT.md): เนื้อหาหลักยังเป็น .NET/IIS; ต้องปรับและทดสอบสำหรับ Node ก่อนนำไปใช้
- [Operations runbook เดิม](../OPERATIONS_RUNBOOK.md): ใช้เป็น checklist ด้าน backup/restore/monitoring; คำสั่งเฉพาะ runtime ต้องตรวจใหม่
- [Team Testing เดิม](../TEAM_TESTING.md): บริบท staging/UAT ไม่ใช่หลักฐาน Production Entra
- [Node API entry point](../../backend-node/README.md): source/runtime package ปัจจุบัน; จำนวน routes ในเอกสารเป็น snapshot
- [งานที่ต้องปิดก่อน release](../planning/PRODUCTION_BACKLOG.md)
- [Main-based candidate](../planning/CANDIDATE_INTEGRATION.md): integrated source and current local validation
- [Mac mini handoff](../MACMINI_HANDOFF.md): the live deployment (scripts/macos/deploy.sh, docker-compose.dev.yml + docker-compose.tls.yml). Push to main runs CI; Deploy starts only after CI passes (.github/workflows/deploy.yml).
- [Branching](../BRANCHING.md): inherited main reference; verify before use.
- The Linux/.NET deployment path (docker-compose.prod.yml, scripts/linux/, backend/) was removed on 2026-10-05.
