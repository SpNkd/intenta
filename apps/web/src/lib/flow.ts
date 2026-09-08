export function routeForFlowState(flowState: string): string {
  switch (flowState) {
    case "onboarding":
      return "/onboarding";
    case "paper":
      return "/intention/paper";
    case "active":
      return "/home";
    case "ready_for_next":
    case "experiment_completed":
    case "progression_unavailable":
      return "/intention";
    default:
      return "/";
  }
}
