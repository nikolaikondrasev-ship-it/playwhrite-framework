import { authMessages, users } from '../../src/data/users';
import { expect, test } from '../../src/fixtures/test';

test.describe('Авторизация', () => {
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.open();
  });

  test('неверные учётные данные показывают ошибку и оставляют пользователя на форме входа', async ({
    loginPage,
    page,
  }) => {
    await loginPage.signIn(users.invalid);

    await expect(loginPage.error).toBeVisible();
    await expect(loginPage.error).toContainText(authMessages.credentialsMismatch);
    await expect(loginPage.loginButton).toBeVisible();
    await expect(page).toHaveURL(/saucedemo\.com\/?$/);
  });

  test('верные учётные данные открывают каталог товаров', async ({
    loginPage,
    inventoryPage,
    page,
  }) => {
    await loginPage.signIn(users.valid);

    await expect(page).toHaveURL(/\/inventory\.html$/);
    await expect(inventoryPage.title).toBeVisible();
    await expect(inventoryPage.title).toHaveText(authMessages.inventoryTitle);
    await expect(inventoryPage.inventoryList).toBeVisible();
  });

  test('после ошибки валидный вход открывает каталог', async ({
    loginPage,
    inventoryPage,
    page,
  }) => {
    await test.step('неверный логин показывает ошибку', async () => {
      await loginPage.signIn(users.invalid);

      await expect(loginPage.error).toBeVisible();
      await expect(loginPage.error).toContainText(authMessages.credentialsMismatch);
      await expect(page).toHaveURL(/saucedemo\.com\/?$/);
    });

    await test.step('верные данные открывают каталог', async () => {
      await loginPage.signIn(users.valid);

      await expect(page).toHaveURL(/\/inventory\.html$/);
      await expect(inventoryPage.title).toBeVisible();
      await expect(inventoryPage.title).toHaveText(authMessages.inventoryTitle);
      await expect(inventoryPage.inventoryList).toBeVisible();
    });
  });
});
