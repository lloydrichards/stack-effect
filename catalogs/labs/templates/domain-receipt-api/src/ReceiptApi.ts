import { Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "effect/http-api";

import { ReceiptExecutionId, ReceiptId, ReceiptStatus } from "./Receipt";

const Receipts = HttpApiGroup.make("receipts")
  .add(
    HttpApiEndpoint.post("start", "/", {
      payload: Schema.Struct({ receiptId: ReceiptId }),
      success: Schema.Struct({ executionId: ReceiptExecutionId }).pipe(
        HttpApiSchema.status(202),
      ),
    }),
  )
  .add(
    HttpApiEndpoint.get("status", "/:executionId", {
      params: { executionId: ReceiptExecutionId },
      success: ReceiptStatus,
    }),
  )
  .prefix("/receipts");

export const ReceiptApi = HttpApi.make("ReceiptApi").add(Receipts);
