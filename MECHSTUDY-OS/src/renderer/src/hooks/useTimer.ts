import { useEffect, useRef } from 'react';
import { useApp } from '../store';
import { api } from '../lib/api';

/**
 * Global study timer. Mounted once in App so it keeps running while the user
 * navigates. Elapsed time is persisted to SQLite every 15 seconds, so a crash
 * loses at most 15 seconds. Paused time is never counted.
 */
export function useGlobalTimer(): void {
  const timer = useApp(s => s.timer);
  const setTimer = useApp(s => s.setTimer);
  const toast = useApp(s => s.toast);
  const notified = useRef(false);

  useEffect(() => {
    if (!timer.running) return;
    const id = window.setInterval(() => {
      const next = useApp.getState().timer.elapsed + 1;
      setTimer({ elapsed: next });

      const t = useApp.getState().timer;
      if (t.mode === 'pomodoro' && t.targetSeconds && next >= t.targetSeconds && !notified.current) {
        notified.current = true;
        setTimer({ running: false });
        toast('Focus block complete. Take a short break.', 'success');
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification('MECHSTUDY OS', { body: 'Focus block complete. Take a short break.' });
        }
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [timer.running, setTimer, toast]);

  useEffect(() => {
    if (!timer.running) notified.current = false;
  }, [timer.running]);

  // Persist progress regularly.
  useEffect(() => {
    if (!timer.running || !timer.sessionId) return;
    if (timer.elapsed === 0 || timer.elapsed % 15 !== 0) return;
    void api.sessions.tick(timer.sessionId, timer.elapsed).catch(() => { /* non-fatal */ });
  }, [timer.elapsed, timer.running, timer.sessionId]);
}
