import type { BlueprintPlatform } from "@tomas-tc/blueprint";
import type { Badge, Button } from "@tomas-tc/ui";
import type { ComponentProps, ReactNode } from "react";

export type TomasUiSectionId = "primitives" | "forms" | "data" | "records" | "navigation" | "pages" | "visuals" | "feedback" | "icons" | "utilities";

export type TomasUiSectionSpec = { id: TomasUiSectionId; title: string; note: string };

export type TomasUiView = TomasUiSectionId | "not-shown";

export type TomasUiViewSpec = { id: TomasUiView; title: string };

export type TomasUiDemoSpec = {
  id: string;
  section: TomasUiSectionId;
  title: string;
  exports: readonly string[];
  drawnInside?: Readonly<Record<string, string>>;
  wide?: boolean;
};

export type TomasUiNotShown = { name: string; reason: string };

export type TomasUiInternal = { name: string; seenIn: string };

export type TomasUiState = "loaded" | "loading" | "empty" | "error";

export type TomasButtonVariant = NonNullable<ComponentProps<typeof Button>["variant"]>;

export type TomasButtonSize = NonNullable<ComponentProps<typeof Button>["size"]>;

export type TomasBadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>;

export type TomasDeviceStatus = "online" | "offline";

export type TomasDeviceRow = { name: string; status: TomasDeviceStatus; uptime: string };

export type TomasUiFrameProps = { look: BlueprintPlatform; children: ReactNode };

export type TomasUiProvidersProps = { locale: string; children: ReactNode };

export type TomasUiSectionProps = { spec: TomasUiSectionSpec; children: ReactNode };

export type TomasUiDemoProps = { id: string; children: ReactNode };

export type TomasUiStatesProps<State extends string> = {
  options: readonly State[];
  label?: string;
  labels?: Readonly<Record<State, string>>;
  value: State;
  onChange: (state: State) => void;
};

export type TomasUiPageProps = { view: TomasUiView };

export type TomasUiNavProps = {
  views: readonly TomasUiViewSpec[];
  view: TomasUiView;
  onViewChange: (view: TomasUiView) => void;
  shown: number;
  total: number;
  look: BlueprintPlatform;
  onLookChange: (look: BlueprintPlatform) => void;
};

export type RowTemplateProps = { text: string };

export type TransitionButtonProps = { field: string; to: string };

export type ClassTableProps = { rows: readonly (readonly [string, string])[] };

export type ConfirmSample = "plain" | "destructive" | "processing";

export type CalendarRange = { from: Date | undefined; to?: Date | undefined };

export type SidebarFrameProps = { children: ReactNode };
