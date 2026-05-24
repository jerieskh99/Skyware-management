/**
 * Domain errors for the receipts module. Routes map these to HTTP codes:
 *   ReceiptValidationError -> 400
 *   ReceiptStateError      -> 422
 */

export class ReceiptValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptValidationError";
  }
}

export class ReceiptStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptStateError";
  }
}
