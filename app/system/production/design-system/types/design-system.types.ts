import type { Badge, Button } from "@tomas-tc/ui";
import type { ComponentProps, ReactNode } from "react";

export type TokenKind = "color" | "font" | "type" | "radius" | "shadow" | "size";

export type DesignToken = { name: string; declared: string; resolved: string; kind: TokenKind };

export type TokenFamily = { key: string; kind: TokenKind; title: string; tokens: DesignToken[] };

export type DesignSystemTab = "tokens" | "components" | "tomas-ui";

export type Notify = (message: string) => void;

export type NotifyProps = { notify: Notify };

export type TokenSampleProps = { token: DesignToken };

export type ModalSize = "sm" | "md" | "lg" | "xl";

export type TomasButtonVariant = NonNullable<ComponentProps<typeof Button>["variant"]>;

export type TomasButtonSize = NonNullable<ComponentProps<typeof Button>["size"]>;

export type TomasBadgeVariant = NonNullable<ComponentProps<typeof Badge>["variant"]>;

export type TomasDeviceStatus = "online" | "offline";

export type TomasDeviceRow = { name: string; status: TomasDeviceStatus; uptime: string };

export type TomasUiFrameProps = { children: ReactNode };

export type TomasUiSectionProps = { title: string; children: ReactNode };
