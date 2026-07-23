export class RequestForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'RequestForbiddenError';
  }
}

export class RequestNotFoundError extends Error {
  constructor(message = 'Request not found') {
    super(message);
    this.name = 'RequestNotFoundError';
  }
}

export class RequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequestValidationError';
  }
}

export class RequestTypeNotFoundError extends Error {
  constructor(message = 'Request type not found') {
    super(message);
    this.name = 'RequestTypeNotFoundError';
  }
}

export class RequestConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequestConflictError';
  }
}
