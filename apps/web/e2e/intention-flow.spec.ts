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

test("replacement recovery code restores the same active Intention", async ({
  page,
  browser,
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
  await expect(page).toHaveURL(/\/recovery$/);
  await page.getByRole("button", { name: "Показать код" }).click();
  const recoveryCode = await page.locator("code").innerText();
  await expect(
    page.getByRole("button", { name: "Я сохранил код" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Я сохранил код" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText("Наблюдаем")).toBeVisible();
  await expect(page.getByText("Куплю себе хорошие наушники.")).toBeVisible();
  await checkAndCapture(page, "10-active-home");
  await page.reload();
  await expect(page).toHaveURL(/\/home$/);
  await page.getByRole("button", { name: "Код доступа" }).click();
  await expect(page).toHaveURL(/\/recovery$/);
  await expect(
    page.getByText(/Предыдущий код перестанет работать/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Создать новый код" }).click();
  const replacementCode = await page.locator("code").innerText();
  expect(replacementCode).not.toBe(recoveryCode);

  const recoveredContext = await browser.newContext();
  const recoveredPage = await recoveredContext.newPage();
  await recoveredPage.goto("/recover");
  await recoveredPage.getByLabel("Recovery code").fill(recoveryCode);
  await recoveredPage.getByRole("button", { name: "Продолжить" }).click();
  await expect(
    recoveredPage.getByText(
      "Не получилось восстановить доступ. Проверь код и попробуй ещё раз.",
    ),
  ).toBeVisible();
  await recoveredContext.close();

  const replacementContext = await browser.newContext();
  const replacementPage = await replacementContext.newPage();
  await replacementPage.goto("/recover");
  await replacementPage.getByLabel("Recovery code").fill(replacementCode);
  await replacementPage.getByRole("button", { name: "Продолжить" }).click();
  await expect(replacementPage).toHaveURL(/\/home$/);
  await expect(
    replacementPage.getByText("Куплю себе хорошие наушники."),
  ).toBeVisible();
  await replacementContext.close();
  await page.goto("/");
  await expect(page).toHaveURL(/\/home$/);
  await page.getByRole("button", { name: "Кажется, случилось" }).click();
  await expect(page).toHaveURL(/\/outcome\//);
  await checkAndCapture(page, "11-outcome-happened");
  await page.getByLabel("Какая сумма появилась? (необязательно)").fill("500");
  await page
    .getByLabel("Откуда пришло событие? (необязательно)")
    .selectOption("gift");
  await page.getByLabel("Заметка (необязательно)").fill("Неожиданный подарок.");
  await page.getByRole("button", { name: "Сохранить результат" }).click();
  await expect(
    page.getByRole("heading", { name: "Результат сохранён" }),
  ).toBeVisible();
  await expect(page.getByText("Неожиданный подарок.")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Результат сохранён" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Продолжить эксперимент" }).click();
  await expect(page).toHaveURL(/\/intention$/);
  await expect(page.getByRole("heading", { name: "1 000 ₽" })).toBeVisible();
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.getByLabel("Моё намерение").fill("Куплю себе новый альбом.");
  await page.getByRole("button", { name: "Сохранить намерение" }).click();
  await expect(page).toHaveURL(/\/intention\/paper$/);
});

test("the last completed step leads to the terminal experiment state", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Попробовать" }).click();
  for (let step = 0; step < 3; step += 1) {
    await page.getByRole("button", { name: "Дальше" }).click();
  }
  await page.getByRole("button", { name: "Начать" }).click();
  await expect(page).toHaveURL(/\/intention$/);
  await expect(page.getByRole("heading", { name: "500 ₽" })).toBeVisible();

  const csrfResponse = await page.request.get("/api/v1/auth/csrf");
  const { csrf_token: csrfToken } = await csrfResponse.json();
  const headers = {
    Origin: new URL(page.url()).origin,
    "X-CSRF-Token": csrfToken,
  };
  const closure = {
    resolution: "uncertain",
    outcome_type: "none",
    source_type: null,
    amount_received_minor: null,
    was_expected: "not_applicable",
    followed_original_intention: "not_applicable",
    user_note: null,
    occurred_at: null,
  };
  for (let position = 1; position <= 5; position += 1) {
    const draft = await page.request.post("/api/v1/intentions", {
      data: { intention_text_raw: `Моё намерение ${position}` },
      headers,
    });
    expect(draft.ok()).toBe(true);
    const intention = await draft.json();
    expect(intention.step_position).toBe(position);
    expect(
      (
        await page.request.post(
          `/api/v1/intentions/${intention.id}/activation`,
          {
            headers,
          },
        )
      ).ok(),
    ).toBe(true);
    expect(
      (
        await page.request.post(`/api/v1/intentions/${intention.id}/outcome`, {
          data: closure,
          headers,
        })
      ).status(),
    ).toBe(201);
  }

  await page.goto("/intention");
  await expect(
    page.getByRole("heading", { name: "Эксперимент завершён" }),
  ).toBeVisible();
  await expect(page.getByText("1 000 ₽")).toHaveCount(0);
  await checkAndCapture(page, "13-experiment-completed");
});

test("a due reflection can be deferred or saved through the existing Outcome flow", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Попробовать" }).click();
  for (let step = 0; step < 3; step += 1) {
    await page.getByRole("button", { name: "Дальше" }).click();
  }
  await page.getByRole("button", { name: "Начать" }).click();
  await expect(page.getByRole("heading", { name: "500 ₽" })).toBeVisible();

  const csrfResponse = await page.request.get("/api/v1/auth/csrf");
  const { csrf_token: csrfToken } = await csrfResponse.json();
  const headers = {
    Origin: new URL(page.url()).origin,
    "X-CSRF-Token": csrfToken,
  };
  const draft = await page.request.post("/api/v1/intentions", {
    data: { intention_text_raw: "Куплю себе книгу" },
    headers,
  });
  const intention = await draft.json();
  expect(
    (
      await page.request.post(`/api/v1/intentions/${intention.id}/activation`, {
        headers,
      })
    ).ok(),
  ).toBe(true);
  const active = await (
    await page.request.get("/api/v1/intentions/current")
  ).json();

  await page.route("**/api/v1/intentions/current", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ...active, reflection_due: true }),
    });
  });
  await page.route(
    `**/api/v1/intentions/${intention.id}/reflection-deferral`,
    async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ...active, reflection_due: false }),
      });
    },
  );
  await page.goto("/home");
  await expect(
    page.getByRole("heading", { name: "Как прошло наблюдение?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Продолжить наблюдение" }).click();
  await expect(
    page.getByRole("heading", { name: "Как прошло наблюдение?" }),
  ).toHaveCount(0);

  await page.reload();
  await page.getByRole("button", { name: "Не уверен" }).click();
  await expect(page).toHaveURL(/mode=close&resolution=uncertain/);
  await page.getByRole("button", { name: "Сохранить результат" }).click();
  await expect(
    page.getByRole("heading", { name: "Результат сохранён" }),
  ).toBeVisible();
});

test("neutral closure saves an uncertain Outcome", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Попробовать" }).click();
  for (let step = 0; step < 3; step += 1) {
    await page.getByRole("button", { name: "Дальше" }).click();
  }
  await page.getByRole("button", { name: "Начать" }).click();
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.getByLabel("Моё намерение").fill("Куплю себе книгу.");
  await page.getByRole("button", { name: "Сохранить намерение" }).click();
  await page.getByRole("button", { name: "Я записал" }).click();
  await page.getByRole("button", { name: "Создать Интенту" }).click();
  await page.getByRole("button", { name: "Показать код" }).click();
  await page.getByRole("button", { name: "Сделать позже" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await page.getByRole("button", { name: "Завершить наблюдение" }).click();
  await checkAndCapture(page, "12-outcome-closure");
  await page.getByRole("button", { name: "Не уверен" }).click();
  await page.getByLabel("Заметка (необязательно)").fill("Пока не уверен.");
  await page.getByRole("button", { name: "Сохранить результат" }).click();
  await expect(
    page.getByRole("heading", { name: "Результат сохранён" }),
  ).toBeVisible();
  await expect(page.getByText("Пока не уверен.")).toBeVisible();
});

test("invalid recovery code gets a neutral error", async ({ page }) => {
  await page.goto("/recover");
  await page
    .getByLabel("Recovery code")
    .fill("INTENTA-ABCDEFGH-00000000000000000000");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(
    page.getByText(
      "Не получилось восстановить доступ. Проверь код и попробуй ещё раз.",
    ),
  ).toBeVisible();
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
