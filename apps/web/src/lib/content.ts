import common from "../../../../content/ru/common.json";
import activation from "../../../../content/ru/activation.json";
import intentions from "../../../../content/ru/intentions.json";
import onboarding from "../../../../content/ru/onboarding.json";
import outcomes from "../../../../content/ru/outcomes.json";

function requiredText(key: string): string {
  const value = common.data[key as keyof typeof common.data];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing common content key: ${key}`);
  }
  return value;
}

export const content = {
  appName: requiredText("app_name"),
  tagline: requiredText("tagline"),
  tryAction: requiredText("try_action"),
  recoverAction: requiredText("recover_action"),
  recoverTitle: requiredText("recover_title"),
  recoverDescription: requiredText("recover_description"),
  recoverInputLabel: requiredText("recover_input_label"),
  recoverSubmit: requiredText("recover_submit"),
  recoverError: requiredText("recover_error"),
  requestError: requiredText("request_error"),
  backAction: requiredText("back_action"),
  nextAction: requiredText("next_action"),
  startAction: requiredText("start_action"),
  loading: requiredText("loading"),
  readyTitle: requiredText("ready_title"),
  readyDescription: requiredText("ready_description"),
  returnAction: requiredText("return_action"),
  onboardingSteps: onboarding.data,
  intentions: intentions.data,
  activation: activation.data,
  outcomes: outcomes.data,
} as const;
