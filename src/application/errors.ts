export class ApplicationError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly title: string,
    message: string,
  ) {
    super(message);
    this.name = "ApplicationError";
  }
}
