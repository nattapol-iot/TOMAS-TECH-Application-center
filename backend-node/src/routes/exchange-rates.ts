import type { FastifyInstance } from "fastify";
import { ApiError } from "../errors.js";
import { firstQueryValue, parseDateOnly } from "../http.js";
import type { MasterData } from "../master-data/services.js";
import type { CurrentUserService } from "../users.js";

/* Master's baht rate for a quotation's currency and date: the forms offer it, and people still type their own. */
export function registerExchangeRateRoutes(app: FastifyInstance, users: CurrentUserService, masterData: MasterData | null): void {
  app.get("/api/v1/exchange-rates/thb", async (request) => {
    await users.required(request);
    const query = request.query as { currency?: unknown; date?: unknown };
    const currency = (firstQueryValue(query.currency) ?? "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new ApiError(400, "validation_failed", "currency is a three-letter code such as USD.");
    const date = parseDateOnly(firstQueryValue(query.date), "date")!;
    if (!masterData) throw new ApiError(503, "master_data_unavailable", "Master data is not connected, so there is no reference rate.");
    return { rate: await masterData.rates.thbRate(currency, date) };
  });
}
