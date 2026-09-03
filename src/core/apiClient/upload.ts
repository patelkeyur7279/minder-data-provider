import type { AxiosProgressEvent, AxiosRequestConfig } from 'axios';
import type { XSSSanitizer } from '../../utils/security.js';

/**
 * Sanitize outgoing request data, skipping binary/opaque payload types
 * (FormData, Blob, File) that must pass through untouched.
 *
 * Extracted from `ApiClient.sanitizeData` verbatim — the sanitizer instance
 * is now an explicit parameter instead of an implicit `this.sanitizer` read.
 */
export function sanitizeRequestData(data: unknown, sanitizer?: XSSSanitizer): unknown {
  if (!sanitizer) return data;

  // Skip sanitization for binary types and FormData
  if (typeof FormData !== 'undefined' && data instanceof FormData) return data;
  if (typeof Blob !== 'undefined' && data instanceof Blob) return data;
  if (typeof File !== 'undefined' && data instanceof File) return data;

  return sanitizer.sanitize(data);
}

/**
 * Handle different content types with sanitization, mutating `requestConfig`
 * in place with the resolved body (and, for FormData/XML bodies, the
 * matching Content-Type header adjustment).
 *
 * This is the exact logic previously duplicated between `ApiClient.request`
 * and `ApiClient.requestRaw` — centralized here so both call sites share one
 * implementation.
 */
export function applyRequestBody(
  requestConfig: AxiosRequestConfig,
  data: unknown,
  sanitizer?: XSSSanitizer
): void {
  if (!data) return;

  // p-m3-untrimmed-method-whitespace (fix follow-on): a GET never carries a
  // body — this module's own doc comment already claimed "a GET body is not
  // meaningful and was never sent by either path" (core/minder.ts's C2
  // comment), but that was only true for minder()'s `method !== 'GET'`
  // guard; this function had NO equivalent guard at all (only `if (!data)
  // return`), so the provider path silently sent a GET body whenever a
  // caller supplied one. Exposed by the p-m3 fix (normalizing minder()'s
  // method BEFORE its own GET-body-exclusion check made a
  // previously-case-sensitivity-masked divergence, p-gb1-get-with-body,
  // visible on the wire suite) rather than caused by it — the underlying gap
  // predates that fix. `requestConfig.method` is already normalized
  // (trimmed/uppercased) by both call sites (resolveRequest / requestRaw's
  // own `normalizeHttpMethod`) before this function runs; `.toUpperCase()`
  // here is defensive, not load-bearing.
  if ((requestConfig.method || '').toString().toUpperCase() === 'GET') return;

  // p-b6-blob-body-encoding (fix): a bare File/Blob/FileList body must be
  // wrapped into multipart FormData here too — mirroring `minder()`'s OWN,
  // already-tested `isFileUpload()` + FormData-wrap behavior
  // (core/minder.ts, core/minder/utils.ts) — instead of falling through to
  // the generic `else` branch below, which sent it as a RAW (non-multipart)
  // axios body. Checked BEFORE sanitization (binary/opaque payload types are
  // never sanitized — `sanitizeRequestData` already skips them) and BEFORE
  // the `FormData`-instance check just below, since a caller-built FormData
  // must still pass through untouched (this branch never matches a FormData
  // instance itself — only File/Blob/FileList).
  const isBareFileLike =
    (typeof File !== 'undefined' && data instanceof File) ||
    (typeof Blob !== 'undefined' && data instanceof Blob) ||
    (typeof FileList !== 'undefined' && data instanceof FileList);
  if (isBareFileLike) {
    const formData = new FormData();
    if (typeof FileList !== 'undefined' && data instanceof FileList) {
      Array.from(data).forEach((file, index) => {
        formData.append(`file${index}`, file);
      });
    } else {
      formData.append('file', data as Blob);
    }
    requestConfig.data = formData;
    if (requestConfig.headers) {
      delete requestConfig.headers['Content-Type'];
      delete requestConfig.headers['content-type'];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (requestConfig.headers as any)['Content-Type'] = undefined;
    }
    return;
  }

  const sanitizedData = sanitizeRequestData(data, sanitizer);

  if (typeof FormData !== 'undefined' && sanitizedData instanceof FormData) {
    requestConfig.data = sanitizedData;
    // Remove Content-Type to let browser/axios set it with boundary
    // We set it to undefined to ensure it's not merged with defaults
    if (requestConfig.headers) {
      delete requestConfig.headers['Content-Type'];
      delete requestConfig.headers['content-type'];
      // Also set to undefined in case some parts of the system re-add it
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (requestConfig.headers as any)['Content-Type'] = undefined;
    }
  } else if (typeof sanitizedData === 'string' && sanitizedData.startsWith('<?xml')) {
    requestConfig.data = sanitizedData;
    requestConfig.headers!['Content-Type'] = 'application/xml';
  } else {
    requestConfig.data = sanitizedData;
  }
}

/** Build the single-file FormData payload used by `ApiClient.uploadFile`. */
export function buildUploadFormData(file: File): FormData {
  const formData = new FormData();
  formData.append('file', file);
  return formData;
}

/**
 * Build the axios `onUploadProgress` callback for `ApiClient.uploadFile`,
 * translating an axios progress event into Minder's
 * `{ loaded, total, percentage }` shape.
 */
export function createUploadProgressHandler(
  onProgress?: (progress: { loaded: number; total: number; percentage: number }) => void
): (progressEvent: AxiosProgressEvent) => void {
  return (progressEvent: AxiosProgressEvent) => {
    if (onProgress && progressEvent.total) {
      const percentage = Math.round((progressEvent.loaded * 100) / progressEvent.total);
      onProgress({
        loaded: progressEvent.loaded,
        total: progressEvent.total,
        percentage,
      });
    }
  };
}
