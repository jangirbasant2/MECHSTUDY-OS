import type { MechStudyApi } from '../../../shared/api';

declare global {
  interface Window {
    api: MechStudyApi;
  }
}

function missingBridge(): never {
  throw new Error(
    'The application bridge (preload) is not available. ' +
    'The window was probably opened without the desktop shell. Restart MECHSTUDY OS.'
  );
}

export const api: MechStudyApi = new Proxy({} as MechStudyApi, {
  get(_target, prop: string) {
    const bridge = window.api;
    if (!bridge) missingBridge();
    return (bridge as unknown as Record<string, unknown>)[prop];
  },
});

export function hasBridge(): boolean {
  return typeof window !== 'undefined' && !!window.api;
}
