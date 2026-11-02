import { useDesk } from "./state.jsx";
import { createChecks } from "./check-runner.mjs";
export function useChecks() {
  return createChecks(useDesk());
}
