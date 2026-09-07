import { expect, test } from "@playwright/test";
import path from "node:path";

async function checkAndCapture(
  page: import("@playwright/test").Page,
  name: string,
) {
  for (const width of [320, 375, 430]) {
    await page.setViewportSize({ width, height: 812 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({
    path: path.resolve(process.cwd(), "../../artifacts/mobile", `${name}.png`),
    fullPage: true,
  });
}

test("landing through onboarding, draft, paper and Technique", async ({
  page,
}) => {
  await page.goto("/");
  await checkAndCapture(page, "01-landing");
  await page.getByRole("button", { name: "Попробовать" }).click();

  await expect(
    page.getByRole("heading", {
      name: "Интента предложит тебе сумму для небольшого эксперимента.",
    }),
  ).toBeVisible();
  await checkAndCapture(page, "02-onboarding-1");
  for (let step = 0; step < 3; step += 1) {
    await page.getByRole("button", { name: "Дальше" }).click();
    await checkAndCapture(page, `0${step + 3}-onboarding-${step + 2}`);
  }
  await page.getByRole("button", { name: "Начать" }).click();

  await expect(page).toHaveURL(/\/intention$/);
  await expect(page.getByRole("heading", { name: "500 ₽" })).toBeVisible();
  await checkAndCapture(page, "06-amount");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await checkAndCapture(page, "07-intention-form");
  await page.getByLabel("Моё намерение").fill("Куплю себе хорошие наушники.");
  await page.getByRole("button", { name: "Сохранить намерение" }).click();

  await expect(page).toHaveURL(/\/intention\/paper$/);
  await expect(
    page.getByRole("heading", { name: "Теперь запиши это" }),
  ).toBeVisible();
  await expect(page.getByText("«Куплю себе хорошие наушники.»")).toBeVisible();
  await checkAndCapture(page, "08-paper");
  await page.reload();
  await expect(page.getByText("«Куплю себе хорошие наушники.»")).toBeVisible();
  await page.getByRole("button", { name: "Я записал" }).click();

  await expect(page).toHaveURL(/\/intention\/technique$/);
  await expect(
    page.getByRole("heading", { name: "Остановись на минуту" }),
  ).toBeVisible();
  await expect(page.getByText(/Прочитай написанное один раз/)).toBeVisible();
  await checkAndCapture(page, "09-technique");
  await page.getByRole("button", { name: "Создать Интенту" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText("Наблюдаем")).toBeVisible();
  await expect(page.getByText("Куплю себе хорошие наушники.")).toBeVisible();
  await checkAndCapture(page, "10-active-home");
  await page.reload();
  await expect(page).toHaveURL(/\/home$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/home$/);
});

test("an existing session is reused on landing revisit", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Попробовать" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  const firstMe = await page.request.get("/api/v1/me");
  const firstUser = await firstMe.json();

  await page.goto("/");
  await expect(page).toHaveURL(/\/onboarding$/);
  const secondMe = await page.request.get("/api/v1/me");
  const secondUser = await secondMe.json();

  expect(secondUser.id).toBe(firstUser.id);
});

test("a long intention scrolls vertically without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  await page.getByRole("button", { name: "Попробовать" }).click();
  for (let step = 0; step < 3; step += 1) {
    await page.getByRole("button", { name: "Дальше" }).click();
  }
  await page.getByRole("button", { name: "Начать" }).click();
  await page.getByRole("button", { name: "Продолжить" }).click();
  const longText = `${"Очень подробное намерение для себя. ".repeat(14)}`.slice(
    0,
    490,
  );
  await page.getByLabel("Моё намерение").fill(longText);
  await page.getByRole("button", { name: "Сохранить намерение" }).click();
  await expect(
    page.getByRole("heading", { name: "Теперь запиши это" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight > innerHeight,
    ),
  ).toBe(true);
});
