import { base } from "../../stryker.base.mjs";

export default {
  ...base,
  mutate: ["src/**/*.ts"],
};
