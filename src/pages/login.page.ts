import type { Locator, Page } from '@playwright/test';
import type { Credentials } from '../data/users';

export class LoginPage {
  readonly page: Page;
  readonly username: Locator;
  readonly password: Locator;
  readonly loginButton: Locator;
  readonly error: Locator;

  constructor(page: Page) {
    this.page = page;
    this.username = page.getByTestId('username');
    this.password = page.getByTestId('password');
    this.loginButton = page.getByRole('button', { name: 'Login' });
    this.error = page.getByTestId('error');
  }

  async open(): Promise<void> {
    await this.page.goto('/');
    await this.loginButton.waitFor({ state: 'visible' });
  }

  async signIn(credentials: Credentials): Promise<void> {
    await this.username.fill(credentials.username);
    await this.password.fill(credentials.password);
    await this.loginButton.click();
  }
}
