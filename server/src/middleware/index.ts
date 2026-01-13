/**
 * Middleware exports
 */

export {
  apiKeyAuth,
  optionalApiKeyAuth,
  isLocalRequest,
  isTailscaleServeRequest,
  isTrustedRequest,
  wanRestriction,
  API_KEYS,
  type AuthenticatedRequest,
} from './auth';
