"use client";

import type { BlueprintPlatform } from "@tomas-tc/blueprint";
import { useState } from "react";
import { TOMAS_UI_LOOK_KEY, TOMAS_UI_LOOKS } from "../config/tomas-ui.constants";

function readLook(): BlueprintPlatform {
  try {
    const stored = window.localStorage.getItem(TOMAS_UI_LOOK_KEY);
    return TOMAS_UI_LOOKS.find((look) => look === stored) ?? TOMAS_UI_LOOKS[0];
  } catch {
    return TOMAS_UI_LOOKS[0];
  }
}

export function useTomasUiLook() {
  const [look, setLook] = useState(readLook);
  const choose = (next: BlueprintPlatform) => {
    setLook(next);
    try {
      window.localStorage.setItem(TOMAS_UI_LOOK_KEY, next);
    } catch {
      // Blocked storage only means the choice is not remembered; the frame still switches.
    }
  };
  return [look, choose] as const;
}
