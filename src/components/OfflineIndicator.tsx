import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      data-testid="offline-indicator"
      className="fixed bottom-24 left-4 z-40 md:bottom-4 flex items-center gap-2 rounded-full bg-[#D97706] px-3.5 py-1.5 text-xs font-bold text-white shadow-lg"
    >
      <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
      <span>Offline Mode — Cached view active</span>
    </div>
  );
}
