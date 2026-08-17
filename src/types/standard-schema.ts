/**
 * Standard Schema — vendored type-only interface (spec v1, latest tag
 * v1.1.0 / 2025-12-15). See https://github.com/standard-schema/standard-schema
 *
 * This is NOT a library — it's the interface contract published by the
 * Standard Schema spec and already implemented by Zod (>=3.24), Valibot,
 * ArkType, and Effect Schema. A schema object from any of those libraries
 * carries a `"~standard"` property matching the shape below, so vendoring the
 * type here lets `ApiRoute.schema` / `MinderOptions.schema` (Task 3.1 —
 * response validation) accept ANY compliant validator with:
 *  - **zero runtime dependency** (nothing is installed — P3), and
 *  - **zero runtime bytes** (a `export type`-only import is fully erased by
 *    the compiler, so this file contributes nothing to any bundle — P4).
 *
 * Do not add runtime code to this file — it must stay type-only forever.
 */

/** A single validation issue reported by a Standard Schema validator. */
export interface StandardSchemaIssue {
  /** Human-readable error message. */
  readonly message: string;
  /** Path to the invalid property, if applicable. */
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>;
}

/**
 * The result of running a Standard Schema validator against a value: either a
 * (possibly transformed) success `value`, or a non-empty list of `issues`.
 * Exactly one of the two branches is present — never both.
 */
export type StandardSchemaResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<StandardSchemaIssue> };

/**
 * The Standard Schema interface itself. Any object exposing a `"~standard"`
 * property of this shape is a valid Standard Schema — the concrete vendor
 * (Zod, Valibot, ArkType, Effect Schema, …) is irrelevant to Minder, which
 * only ever calls `schema["~standard"].validate(value)`.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    /** The version of the Standard Schema spec implemented. Always `1`. */
    readonly version: 1;
    /** The vendor name of the schema library (e.g. `"zod"`, `"valibot"`). */
    readonly vendor: string;
    /**
     * Validates a value, returning the parsed/transformed output or a list of
     * issues. May be synchronous or asynchronous — callers must `await` (or
     * `Promise.resolve(...)`) the result either way.
     */
    readonly validate: (
      value: unknown
    ) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>;
    /**
     * Type-only inference carriers. Never populated at runtime — `InferInput`/
     * `InferOutput` read this purely at the type level.
     */
    readonly types?: { readonly input: Input; readonly output: Output } | undefined;
  };
}

/** Infers the validated/transformed output type of a Standard Schema. */
export type InferOutput<S extends StandardSchemaV1<any, any>> =
  NonNullable<S['~standard']['types']>['output'];

/** Infers the input type a Standard Schema expects. */
export type InferInput<S extends StandardSchemaV1<any, any>> =
  NonNullable<S['~standard']['types']>['input'];
