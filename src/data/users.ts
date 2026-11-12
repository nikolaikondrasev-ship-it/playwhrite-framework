export type Credentials = {
  readonly username: string;
  readonly password: string;
};

export const users = {
  valid: {
    username: process.env.SAUCE_USERNAME ?? 'standard_user',
    password: process.env.SAUCE_PASSWORD ?? 'secret_sauce',
  },
  invalid: {
    username: 'invalid_user',
    password: 'wrong_password',
  },
} as const satisfies Record<string, Credentials>;

export const authMessages = {
  credentialsMismatch:
    'Epic sadface: Username and password do not match any user in this service',
  inventoryTitle: 'Products',
} as const;
