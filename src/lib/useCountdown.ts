import { useEffect, useState } from 'react';
import { serverNow } from './clock';

export function useCountdown(endsAt: number | null, running: boolean): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (!endsAt || !running) return;
    const interval = setInterval(() => setNow(serverNow()), 100);
    return () => clearInterval(interval);
  }, [endsAt, running]);
  return endsAt && running ? Math.max(0, Math.ceil((endsAt - Math.max(now, serverNow())) / 1000)) : 0;
}
