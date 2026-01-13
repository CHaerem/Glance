/**
 * API Type Definitions
 * Express request/response types and API contracts
 */

import type { Request, Response, NextFunction, Router } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';
import type OpenAI from 'openai';
import type { Multer } from 'multer';

// Extended Express Request with typed body, query, and params
export interface TypedRequest<
  TBody = unknown,
  TQuery extends ParsedQs = ParsedQs,
  TParams extends ParamsDictionary = ParamsDictionary
> extends Request<TParams, unknown, TBody, TQuery> {
  body: TBody;
  query: TQuery;
  params: TParams;
}

// Extended Express Response with typed JSON body
export interface TypedResponse<TData = unknown> extends Response {
  json: (body: TData) => this;
}

// Async request handler type
export type AsyncHandler<
  TBody = unknown,
  TQuery extends ParsedQs = ParsedQs,
  TParams extends ParamsDictionary = ParamsDictionary,
  TResponse = unknown
> = (
  req: TypedRequest<TBody, TQuery, TParams>,
  res: TypedResponse<TResponse>,
  next: NextFunction
) => Promise<void>;

// Standard API response wrapper
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Error response
export interface ApiErrorResponse {
  error: string;
  message?: string;
  details?: unknown;
}

// Health check response
export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  uptime: number;
  version?: string;
  buildDate?: string;
  memoryUsage?: NodeJS.MemoryUsage;
}

// Build info response
export interface BuildInfoResponse {
  version: string;
  buildDate: string;
  buildDateHuman: string;
  imageVersion: string;
  environment: string;
}

// Router factory dependencies
export interface RouterDependencies {
  openai?: OpenAI;
  uploadDir: string;
  upload?: Multer;
  firmwareVersion?: string;
  buildDate?: string;
  imageVersion?: string;
  buildDateHuman?: string;
  glanceBaseUrl?: string;
}

// Route factory function type
export type RouteFactory<TDeps = RouterDependencies> = (deps: TDeps) => Router;

// Middleware function type
export type MiddlewareFunction = (
  req: Request,
  res: Response,
  next: NextFunction
) => void | Promise<void>;

// Auth middleware types
export interface AuthConfig {
  apiKeys: string[];
  localNetworkPrefixes: string[];
  tailscalePrefix: string;
}

// Multer file type for upload handling
export interface MulterFile {
  path: string;
  originalname: string;
  fieldname?: string;
  encoding?: string;
  mimetype?: string;
  size?: number;
  destination?: string;
  filename?: string;
  buffer?: Buffer;
}

// Request with uploaded file
export type FileRequest = Request & {
  file?: MulterFile;
};

// Current display data (stored in current.json)
export interface CurrentData {
  title?: string;
  image?: string;
  imageId?: string;
  timestamp?: number;
  sleepDuration?: number;
  rotation?: number;
  artist?: string;
  source?: string;
  devServerHost?: string;
}

// Playlist configuration (stored in playlist.json)
export interface PlaylistData {
  active?: boolean;
  images?: string[];
  mode?: 'random' | 'sequential';
  interval?: number;
  currentIndex?: number;
  lastUpdate?: number;
  createdAt?: number;
}
