/**
 * Marking a practice answer.
 *
 * The implementation lives in src/shared/grade.ts so the main process can
 * evaluate a submitted exam with exactly the same rules the renderer shows
 * while practising. This module re-exports it for the existing renderer
 * imports ('../lib/grade').
 */

export * from '../../../shared/grade';