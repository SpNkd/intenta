import common from "../../../../content/ru/common.json";
import activation from "../../../../content/ru/activation.json";
import intentions from "../../../../content/ru/intentions.json";
import onboarding from "../../../../content/ru/onboarding.json";
import outcomes from "../../../../content/ru/outcomes.json";
import reflections from "../../../../content/ru/reflections.json";
import history from "../../../../content/ru/history.json";

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
  landingDescription: requiredText("landing_description"),
  tryAction: requiredText("try_action"),
  recoverAction: requiredText("recover_action"),
  recoverTitle: requiredText("recover_title"),
  recoverDescription: requiredText("recover_description"),
  recoverInputLabel: requiredText("recover_input_label"),
  recoverSubmit: requiredText("recover_submit"),
  recoverError: requiredText("recover_error"),
  requestError: requiredText("request_error"),
  retryAction: requiredText("retry_action"),
  backAction: requiredText("back_action"),
  nextAction: requiredText("next_action"),
  startAction: requiredText("start_action"),
  loading: requiredText("loading"),
  readyTitle: requiredText("ready_title"),
  readyDescription: requiredText("ready_description"),
  returnAction: requiredText("return_action"),
  learnAction: requiredText("learn_action"),
  aboutTitle: requiredText("about_title"),
  aboutDescription: requiredText("about_description"),
  aboutStepOne: requiredText("about_step_one"),
  aboutStepTwo: requiredText("about_step_two"),
  aboutStepThree: requiredText("about_step_three"),
  backToIntentionAction: requiredText("back_to_intention_action"),
  onboardingSteps: onboarding.data,
  intentions: intentions.data,
  activation: activation.data,
  outcomes: outcomes.data,
  reflections: reflections.data,
  history: history.data,
} as const;
