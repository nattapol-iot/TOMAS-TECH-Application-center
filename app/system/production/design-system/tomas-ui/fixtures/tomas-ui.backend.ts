import type { AdapterRegistry, DataAdapter, Entity } from "@tomas-tc/blueprint";
import { RestAdapter, rowsAnalyticsSource, serverAnalyticsSource } from "@tomas-tc/ui";
import { MOCK_API_BASE } from "../config/tomas-ui.constants";
import type { TomasUiState } from "../types/tomas-ui.types";
import { memoryAdapter } from "../utils/memory-adapter";
import { mockAnalyticsRequest, mockRestRequest } from "../utils/mock-server";
import { DEVICE, SAMPLE_ENTITIES, WORK_ORDER } from "./tomas-ui.entities";
import { DEVICE_ROWS, SITE_ROWS, TECHNICIAN_ROWS, WORK_NOTE_ROWS, WORK_ORDER_ACTIVITY, WORK_ORDER_ROWS, WORK_PART_ROWS } from "./tomas-ui.rows";

const devices = memoryAdapter(DEVICE_ROWS);

export const SAMPLE_ADAPTERS: AdapterRegistry = {
  technician: memoryAdapter(TECHNICIAN_ROWS),
  site: memoryAdapter(SITE_ROWS),
  device: devices,
  "work-order": { ...memoryAdapter(WORK_ORDER_ROWS), activity: async () => WORK_ORDER_ACTIVITY },
  "work-part": memoryAdapter(WORK_PART_ROWS),
  "work-note": memoryAdapter(WORK_NOTE_ROWS),
};

const never = () => new Promise<never>(() => undefined);

const fail = async (): Promise<never> => {
  throw new Error("The sample backend is unavailable");
};

export const PENDING_ADAPTER: DataAdapter = { list: never, get: never, create: never, update: never, remove: never, all: never };

export const FAILING_ADAPTER: DataAdapter = { list: fail, get: fail, create: fail, update: fail, remove: fail, all: fail };

const STATE_SOURCES: Record<TomasUiState, DataAdapter> = { loaded: devices, loading: PENDING_ADAPTER, empty: memoryAdapter([]), error: FAILING_ADAPTER };

// Each state reads under an entity key of its own, so the query cache never answers one state with another's rows.
export const STATE_DEVICES: Record<TomasUiState, Entity> = {
  loaded: { ...DEVICE, key: "device-loaded" },
  loading: { ...DEVICE, key: "device-loading" },
  empty: { ...DEVICE, key: "device-empty" },
  error: { ...DEVICE, key: "device-error" },
};

export const STATE_ADAPTERS: Record<TomasUiState, AdapterRegistry> = {
  loaded: { ...SAMPLE_ADAPTERS, [STATE_DEVICES.loaded.key]: STATE_SOURCES.loaded },
  loading: { ...SAMPLE_ADAPTERS, [STATE_DEVICES.loading.key]: STATE_SOURCES.loading },
  empty: { ...SAMPLE_ADAPTERS, [STATE_DEVICES.empty.key]: STATE_SOURCES.empty },
  error: { ...SAMPLE_ADAPTERS, [STATE_DEVICES.error.key]: STATE_SOURCES.error },
};

export const REST_DEVICE: Entity = { ...DEVICE, key: "device-rest" };

export const REST_ADAPTERS: AdapterRegistry = {
  ...SAMPLE_ADAPTERS,
  [REST_DEVICE.key]: new RestAdapter({ entity: REST_DEVICE, baseUrl: MOCK_API_BASE, request: mockRestRequest({ [REST_DEVICE.key]: DEVICE_ROWS }) }),
};

export const SERVER_WORK_ORDER: Entity = { ...WORK_ORDER, key: "work-order-server" };

export const ROWS_ANALYTICS = rowsAnalyticsSource(SAMPLE_ENTITIES, SAMPLE_ADAPTERS);

export const SERVER_ANALYTICS = serverAnalyticsSource({
  entities: [...SAMPLE_ENTITIES, SERVER_WORK_ORDER],
  adapters: SAMPLE_ADAPTERS,
  baseUrl: MOCK_API_BASE,
  request: mockAnalyticsRequest(WORK_ORDER_ROWS),
});
