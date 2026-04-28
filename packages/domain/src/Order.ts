import { Order } from "effect";

export const pathStrOrd = Order.mapInput(
  Order.Array(Order.String),
  (path: string) => path.split("/"),
);

export const pathOrd = Order.mapInput(
  pathStrOrd,
  (input: { path: string }) => input.path,
);

export const idOrd = Order.mapInput(
  Order.String,
  (input: { id: string }) => input.id,
);
