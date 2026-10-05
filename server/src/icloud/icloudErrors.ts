export const ICLOUD_MISSING_PASSWORD_MESSAGE =
  "Falta la contraseña de app de iCloud en el Llavero (ledgerly-icloud-imap). Los pasos están en el README, sección «Importar desde iCloud».";
export const ICLOUD_AUTH_FAILED_MESSAGE =
  "iCloud rechazó el usuario o la contraseña de app. Generá una nueva en account.apple.com y actualizala en el Llavero (ledgerly-icloud-imap).";

export class IcloudAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IcloudAuthError";
  }
}

export class IcloudApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IcloudApiError";
  }
}
