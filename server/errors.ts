export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}
export const bad = (msg: string, code = 'BAD_REQUEST') => new HttpError(400, code, msg);
export const unauthorized = (msg = 'Authentication required') => new HttpError(401, 'UNAUTHORIZED', msg);
export const forbidden = (msg: string, code = 'FORBIDDEN') => new HttpError(403, code, msg);
export const notFound = (msg = 'Not found') => new HttpError(404, 'NOT_FOUND', msg);
export const conflict = (msg: string, code = 'CONFLICT') => new HttpError(409, code, msg);
