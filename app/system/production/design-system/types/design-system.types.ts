export type TokenKind = "color" | "font" | "type" | "radius" | "shadow" | "size";

export type DesignToken = { name: string; declared: string; resolved: string; kind: TokenKind };

export type TokenFamily = { key: string; kind: TokenKind; title: string; tokens: DesignToken[] };

export type DesignSystemTab = "tokens" | "components" | "tomas-ui";

export type Notify = (message: string) => void;

export type NotifyProps = { notify: Notify };

export type TokenSampleProps = { token: DesignToken };

export type ModalSize = "sm" | "md" | "lg" | "xl";
