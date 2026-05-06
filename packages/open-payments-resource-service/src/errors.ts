const ResourceServerErrorCode = {
  invalid_request: 'invalid_request',
  not_found: 'not_found'
} as const;
type ResourceServerErrorCode = keyof typeof ResourceServerErrorCode;

export interface OpenPaymentsResourceServerErrorResponse {
  error: {
    code: ResourceServerErrorCode;
    description?: string;
    details?: Record<string, unknown>;
  };
}

type HTTPStatus = 400 | 401 | 403 | 404 | 500;

export class OpenPaymentsResourceServerRouteError extends Error {
  public status: HTTPStatus;
  public code: ResourceServerErrorCode;
  public details?: Record<string, unknown>;

  constructor(
    status: HTTPStatus,
    message: string,
    code: ResourceServerErrorCode,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'OpenPaymentsResourceServerRouteError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}
