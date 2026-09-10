# Operations

Updated: 2026-09-10. Owner: Release/Operations.

- [Release control](RELEASE_CONTROL.md): candidate, artifact, schema และวิธีสืบ feature regression
- [Production deployment เดิม](../PRODUCTION_DEPLOYMENT.md): เนื้อหาหลักยังเป็น .NET/IIS; ต้องปรับและทดสอบสำหรับ Node ก่อนนำไปใช้
- [Operations runbook เดิม](../OPERATIONS_RUNBOOK.md): ใช้เป็น checklist ด้าน backup/restore/monitoring; คำสั่งเฉพาะ runtime ต้องตรวจใหม่
- [Team Testing เดิม](../TEAM_TESTING.md): บริบท staging/UAT ไม่ใช่หลักฐาน Production Entra
- [Node API entry point](../../backend-node/README.md): source/runtime package ปัจจุบัน; จำนวน routes ในเอกสารเป็น snapshot
- [งานที่ต้องปิดก่อน release](../planning/PRODUCTION_BACKLOG.md)
- [Main-based candidate](../planning/CANDIDATE_INTEGRATION.md): integrated source and current local validation
- [Mac mini handoff](../MACMINI_HANDOFF.md), [Linux deployment](../PRODUCTION_DEPLOYMENT_LINUX.md), [CI/CD setup](../CI_CD_SETUP.md), [branching](../BRANCHING.md): inherited main references; verify candidate/runtime applicability before use
