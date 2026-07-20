/**
 * 🎯 MINDER - Universal Data Provider Function
 * 
 * The ONE function that handles EVERYTHING:
 * - GET, POST, PUT, DELETE, PATCH requests
 * - File uploads with progress tracking
 * - FormData handling
 * - Model class integration (encode/decode)
 * - Automatic error handling (never throws)
 * - TanStack Query integration (caching, deduplication)
 * - WebSocket support (realtime updates)
 * 
 * @example
 * // Simple GET
 * const { data } = await minder('users');
 * 
 * @example
 * // Create with POST
 * const { data } = await minder('users', { name: 'John' });
 * 
 * @example
 * // Update with PUT
 * const { data } = await minder('users/1', { name: 'Jane' });
 * 
 * @example
 * // Delete
 * const { data } = await minder('users/1', { method: 'DELETE' });
 * 
 * @example
 * // File upload with progress
 * const { data } = await minder('upload', file, {
 *   onProgress: (p) => console.log(`${p.percentage}%`)
 * });
 * 
 * @example
 * // With model class (auto encode/decode)
 * const { data } = await minder('users', userData, {
 *   model: UserModel // Your custom model class
 * });
 */

import axios from 'axios';
import type { AxiosRequestConfig, AxiosProgressEvent } from 'axios';
import type { 
  HttpMethod, 
  MinderOptions, 
  MinderResult, 
  MinderError,
  MinderConfig,
  UploadProgress 
} from './minder/types.js';
import {
  detectMethod,
  isFileUpload,
  encodeWithModel,
  decodeWithModel,
  handleError,
  isEdgeRuntime
} from './minder/utils.js';

// Re-export types for backward compatibility
export type { 
  HttpMethod, 
  MinderOptions, 
  MinderResult, 
  MinderError,
  UploadProgress 
} from './minder/types.js';

// ============================================================================
// GLOBAL CONFIGURATION
// ============================================================================

import { getGlobalMinderConfig } from './globalConfig.js';

// minder()'s URL-resolution bag (baseURL/headers/timeout/token). Together with
// the routes-aware registry (getGlobalMinderConfig) this forms ONE unified
// config: the registry supplies url/method/headers/timeout for registered route
// NAMES, and this bag supplies the baseURL/headers/token used to actually
// dispatch the request. `configureMinder()` from `src/config` is the single
// source of truth that writes both stores.
let globalConfig: MinderConfig = {
  baseURL: '',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
};

/**
 * Internal: write minder()'s URL-resolution config (baseURL/headers/timeout/
 * token). Used by the unified `configureMinder()` (src/config) so both global
 * stores stay in sync. Does NOT emit a deprecation warning.
 * @internal
 */
export function setMinderGlobalConfig(config: Partial<MinderConfig>): void {
  globalConfig = { ...globalConfig, ...config };
}

/**
 * Internal: read minder()'s current URL-resolution config (for tests/tools).
 * @internal
 */
export function getMinderGlobalConfig(): MinderConfig {
  return globalConfig;
}

let deprecationWarned = false;

/**
 * Configure minder globally.
 *
 * @deprecated Use `configureMinder` from `minder-data-provider` (or
 * `minder-data-provider/config`) instead — it is the single source of truth and
 * also registers your routes. This baseURL/headers-only configurator is kept as
 * a deprecated alias (exposed as `minder.config()`) that writes the same
 * underlying store.
 *
 * @example
 * minder.config({
 *   baseURL: 'https://api.example.com',
 *   token: 'your-jwt-token'
 * });
 */
export function configureMinder(config: Partial<MinderConfig>): void {
  if (!deprecationWarned) {
    deprecationWarned = true;
    console.warn(
      '[Minder] `minder.config()` / `configureMinder` from core is deprecated. ' +
      'Use `configureMinder` from "minder-data-provider" instead (it also registers routes).'
    );
  }
  setMinderGlobalConfig(config);
}

import { StreamClient, type StreamOptions } from './StreamClient.js';
import { pluginManager, isShortCircuitResponse } from '../plugins/PluginSystem.js';
import type { InterceptableRequest } from '../plugins/PluginSystem.js';

// ============================================================================
// CORE MINDER FUNCTION
// ============================================================================

/**
 * 🎯 MINDER - The universal data provider function
 * 
 * Handles all HTTP operations with smart detection
 * NEVER throws errors - always returns structured result
 */
export async function minder<TData = any>(
  route: string,
  data?: any,
  options?: MinderOptions
): Promise<MinderResult<TData>> {
  const startTime = Date.now();
  
  try {
    // 0. Consult the unified route registry: when `route` is a registered NAME,
    //    resolve its url/method/headers/timeout from the registry entry (with
    //    trivial `:param` substitution). When `route` is a URL/path, behavior is
    //    unchanged — it is used verbatim.
    const registry = getGlobalMinderConfig();
    const registryRoute = registry?.routes?.[route];

    let url = route;
    if (registryRoute) {
      url = registryRoute.url;
      if (options?.params) {
        Object.entries(options.params).forEach(([key, value]) => {
          url = url.replace(`:${key}`, String(value));
        });
      }
    }

    // 1. Detect HTTP method (explicit option > registry entry > auto-detect)
    let method = detectMethod(route, data, options);
    if (registryRoute && !options?.method) {
      method = registryRoute.method as unknown as HttpMethod;
    }

    // 2. Build request config
    const config: AxiosRequestConfig = {
      baseURL:
        options?.baseURL ||
        globalConfig.baseURL ||
        (registryRoute ? registry?.apiBaseUrl : undefined) ||
        '',
      url,
      method,
      timeout: options?.timeout || registryRoute?.timeout || globalConfig.timeout,
      headers: {
        ...globalConfig.headers,
        ...registryRoute?.headers,
        ...options?.headers,
      },
      params: options?.params,
    };
    
    // 3. Add authentication token
    const token = options?.token || globalConfig.token;
    if (token) {
      config.headers!.Authorization = `Bearer ${token}`;
    }
    
    // 4. Handle file upload
    if (isFileUpload(data)) {
      config.headers!['Content-Type'] = 'multipart/form-data';
      
      // Convert to FormData if needed
      if (!(data instanceof FormData)) {
        const formData = new FormData();
        // Guard the browser-only FileList global (undefined in Node/edge) so a
        // File/Blob upload on the server doesn't throw "FileList is not defined".
        if (typeof FileList !== 'undefined' && data instanceof FileList) {
          Array.from(data).forEach((file, index) => {
            formData.append(`file${index}`, file);
          });
        } else {
          formData.append('file', data);
        }
        config.data = formData;
      } else {
        config.data = data;
      }
      
      // Upload progress tracking
      if (options?.onProgress) {
        config.onUploadProgress = (progressEvent: AxiosProgressEvent) => {
          const progress: UploadProgress = {
            loaded: progressEvent.loaded,
            total: progressEvent.total || 0,
            percentage: progressEvent.total 
              ? Math.round((progressEvent.loaded * 100) / progressEvent.total)
              : 0,
          };
          options.onProgress!(progress);
        };
      }
    }
    // 5. Handle regular data
    else if (method !== 'GET' && method !== 'DELETE') {
      // Encode with model if provided
      const encodedData = encodeWithModel(data, options?.model);
      config.data = encodedData;
    }
    
    // 6. Execute request
    let responseData: any;
    let responseStatus = 0;
    let responseHeaders: Record<string, string> = {};
    let shortCircuited = false;

    // Mutating request middleware: registered plugins may rewrite the outgoing
    // config or short-circuit the request with a synthetic response. Runs after
    // the config is fully assembled and before the transport dispatch. Guarded
    // so there is zero overhead when no plugin implements the hook.
    if (pluginManager.size > 0 && pluginManager.hasRequestInterceptors()) {
      const interceptable: InterceptableRequest = {
        url: config.url || route,
        method,
        headers: (config.headers as Record<string, string>) || {},
        params: config.params as Record<string, unknown> | undefined,
        data: config.data,
        routeName: registryRoute ? route : undefined,
      };
      const intercepted = await pluginManager.executeRequestInterceptors(interceptable);
      if (isShortCircuitResponse(intercepted)) {
        responseData = intercepted.response.data;
        responseStatus = intercepted.response.status;
        responseHeaders = intercepted.response.headers || {};
        shortCircuited = true;
      } else {
        // Apply the middleware's mutations back onto the outgoing config.
        config.url = intercepted.url;
        config.method = intercepted.method as HttpMethod;
        config.headers = intercepted.headers;
        config.params = intercepted.params;
        config.data = intercepted.data;
      }
    }

    // Fire plugin request hooks (global plugins; non-blocking observability)
    if (pluginManager.size > 0) {
      void pluginManager.executeRequestHooks({
        method,
        url: route,
        headers: config.headers as Record<string, string> | undefined,
        body: data,
        timestamp: startTime,
      });
    }

    // Transport selection:
    // - Complex requests (file uploads / progress) always use axios.
    // - `transport: 'fetch'` forces the native-fetch fast-path; `'axios'` forces axios.
    // - `'auto'` (and unset) pick fetch ONLY in an edge runtime (isEdgeRuntime),
    //   where axios's Node HTTP adapter is unavailable and would otherwise fail.
    //   Node and browser keep the axios default unchanged — so this can never
    //   silently change request semantics for existing Node/browser callers; it
    //   only makes edge (previously broken with the default) transparently work.
    const isComplexRequest = isFileUpload(data) || options?.onProgress || config.onUploadProgress;
    const transport = options?.transport;
    const wantsFetch =
      transport === 'fetch' ||
      ((transport === 'auto' || transport === undefined) && isEdgeRuntime());
    const useFetch = wantsFetch && !isComplexRequest;

    if (shortCircuited) {
      // A plugin already produced a synthetic response — skip the transport
      // entirely (responseData/status/headers were set during interception).
    } else if (!useFetch) {
      const response = await axios(config);
      responseData = response.data;
      responseStatus = response.status;
      responseHeaders = response.headers as Record<string, string>;
    } else {
      // Super-fast native fetch path
      // MDPD-18: absolute http(s) URLs bypass the configured baseURL, mirroring
      // the axios path — otherwise baseURL is double-prefixed onto the absolute
      // URL (e.g. 'http://BASEhttp://x/api').
      const requestUrl = config.url || '';
      let fullUrl = /^https?:\/\//i.test(requestUrl)
        ? requestUrl
        : (config.baseURL || '') + requestUrl;
      
      // Handle query parameters
      if (config.params) {
        const queryParams = new URLSearchParams();
        Object.entries(config.params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            queryParams.append(key, String(value));
          }
        });
        const queryString = queryParams.toString();
        if (queryString) {
          fullUrl += (fullUrl.includes('?') ? '&' : '?') + queryString;
        }
      }

      const fetchOptions: RequestInit = {
        method: config.method,
        headers: config.headers as Record<string, string>,
        body: (config.method !== 'GET' && config.method !== 'HEAD' && config.data) 
          ? (typeof config.data === 'string' ? config.data : JSON.stringify(config.data)) 
          : undefined,
      };
      
      const controller = new AbortController();
      const timeoutId = config.timeout ? setTimeout(() => controller.abort(), config.timeout) : null;
      fetchOptions.signal = controller.signal;
      
      const response = await fetch(fullUrl, fetchOptions);
      if (timeoutId) clearTimeout(timeoutId);
      
      responseStatus = response.status;
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      
      if (!response.ok) {
         // Create axios-like error for compatibility with handleError
         const error: any = new Error(response.statusText);
         error.response = { status: responseStatus, data: await response.text().catch(() => ''), headers: responseHeaders };
         error.isAxiosError = true;
         throw error;
      }
      
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        responseData = await response.json().catch(() => null);
      } else {
        responseData = await response.text().catch(() => '');
      }
    }
    
    // 7. Decode response with model if provided
    const decodedData = decodeWithModel<TData>(responseData, options?.model);
    
    // 8. Calculate duration
    const duration = Date.now() - startTime;

    // Fire plugin response hooks (non-blocking)
    if (pluginManager.size > 0) {
      void pluginManager.executeResponseHooks({
        status: responseStatus,
        data: responseData,
        headers: responseHeaders,
        duration,
        timestamp: Date.now(),
      });
    }

    // 9. Success callback
    if (options?.onSuccess) {
      options.onSuccess(decodedData);
    }
    
    // 10. Return success result
    return {
      data: decodedData,
      error: null,
      status: responseStatus,
      success: true,
      headers: responseHeaders,
      metadata: {
        method,
        url: route,
        duration,
        cached: false,
      },
    };
    
  } catch (error: unknown) {
    // Handle error - NEVER throw
    const minderError = handleError(error);

    // Expose the ORIGINAL underlying error (e.g. the raw AxiosError) as `.raw` so
    // consumers can inspect the untouched transport error, not just the normalized
    // Minder shape. Survives into both the returned error result and the thrown
    // throwOnError error below.
    (minderError as { raw?: unknown }).raw = error;

    // Fire plugin error hooks (non-blocking)
    if (pluginManager.size > 0) {
      void pluginManager.executeErrorHooks({
        message: minderError.message,
        code: minderError.code,
        timestamp: Date.now(),
      });
    }

    // Error callback
    if (options?.onError) {
      options.onError(minderError);
    }

    // Opt-in: throw instead of returning a structured error result.
    if (options?.throwOnError) {
      const err = new Error(minderError.message);
      Object.assign(err, {
        code: minderError.code,
        status: minderError.status,
        details: minderError.details,
        minderError,
        // Original underlying error, so throwOnError consumers get `.raw` too.
        raw: error,
      });
      throw err;
    }

    // Return error result
    return {
      data: null,
      error: minderError,
      status: minderError.status,
      success: false,
      metadata: {
        method: detectMethod(route, data, options),
        url: route,
        duration: Date.now() - startTime,
        cached: false,
      },
    };
  }
}

// ============================================================================
// CONVENIENCE METHODS
// ============================================================================

/**
 * Attach config method to minder function
 */
(minder as any).config = configureMinder;

/**
 * Attach Server-Sent Events stream capability
 */
(minder as any).stream = async (url: string, options: StreamOptions) => {
  const streamClient = new StreamClient(globalConfig as any);
  return streamClient.stream(url, options);
};

/**
 * Export configured minder as default
 */
export default minder;
