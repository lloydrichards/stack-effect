import { Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "effect/http-api";

export const ReceiptStatus = Schema.TaggedUnion({
  Pending: {},
  Confirmed: { receiptId: Schema.NonEmptyString },
  Failed: {},
});
export type ReceiptStatus = typeof ReceiptStatus.Type;

const ExecutionId = Schema.NonEmptyString;

const Receipts = HttpApiGroup.make("receipts")
  .add(
    HttpApiEndpoint.post("start", "/", {
      payload: Schema.Struct({ receiptId: Schema.NonEmptyString }),
      success: Schema.Struct({ executionId: ExecutionId }).pipe(
        HttpApiSchema.status(202),
      ),
    }),
  )
  .add(
    HttpApiEndpoint.get("status", "/:executionId", {
      params: { executionId: ExecutionId },
      success: ReceiptStatus,
    }),
  )
  .prefix("/receipts");

export const ReceiptApi = HttpApi.make("ReceiptApi").add(Receipts);
