"use client";

import { ApprovalStepper, Button, PersonAvatar, type FlowStep, type StepperOrientation } from "@tomas-tc/ui";
import { useState } from "react";
import { useT } from "../../../../i18n";
import { APPROVAL_FLOW, APPROVAL_PEOPLE, STEPPER_ORIENTATIONS } from "../config/tomas-ui.constants";
import { TomasUiDemo } from "../TomasUiDemo";
import { TomasUiStates } from "../TomasUiStates";

export function ApprovalStepperDemo() {
  const t = useT();
  const [orientation, setOrientation] = useState<StepperOrientation>("horizontal");
  const [current, setCurrent] = useState(2);
  const [failed, setFailed] = useState(false);
  const steps: FlowStep[] = APPROVAL_FLOW.map((step, index) => ({
    value: step.value,
    label: t(step.label),
    state: index < current ? "done" : index === current ? (failed ? "failed" : "current") : "pending",
    moved:
      index < current ? { id: `move-${index}`, at: step.at, actor: APPROVAL_PEOPLE[index], kind: "moved", field: "status", from: APPROVAL_FLOW[index - 1]?.value ?? null, to: step.value } : undefined,
    note: index === current && failed ? t("TUI.rejectNote") : undefined,
  }));
  const done = current >= APPROVAL_FLOW.length;
  return (
    <TomasUiDemo id="approval-stepper">
      <TomasUiStates options={STEPPER_ORIENTATIONS} value={orientation} onChange={setOrientation} />
      <ApprovalStepper label={t("TUI.approvalFlow")} steps={steps} orientation={orientation} />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={done}
          onClick={() => {
            setFailed(false);
            setCurrent(current + 1);
          }}
        >
          {t("TUI.approve")}
        </Button>
        <Button size="sm" variant="destructive" disabled={done || failed} onClick={() => setFailed(true)}>
          {t("TUI.reject")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setFailed(false);
            setCurrent(1);
          }}
        >
          {t("TUI.reset")}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {APPROVAL_PEOPLE.map((name) => (
          <span key={name} className="flex items-center gap-2 text-sm">
            <PersonAvatar name={name} />
            {name}
          </span>
        ))}
      </div>
    </TomasUiDemo>
  );
}
