import { useEffect } from 'react';
import {
  AlertCircle,
  Bell,
  CheckCheck,
  KeyRound,
  Swords,
  Trophy,
  X,
} from 'lucide-react';
import type { AppNotification } from '../utils/notifications';

interface NotificationDrawerProps {
  open: boolean;
  notifications: AppNotification[];
  readIds: string[];
  onClose: () => void;
  onMarkAllRead: () => void;
  onSelectNotification: (notification: AppNotification) => void;
}

function formatAlertTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function NotificationDrawer({
  open,
  notifications,
  readIds,
  onClose,
  onMarkAllRead,
  onSelectNotification,
}: NotificationDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const readSet = new Set(readIds);
  const unreadCount = notifications.filter((n) => !n.defaultRead && !readSet.has(n.id)).length;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Recent alerts and notifications"
      data-testid="notification-drawer"
    >
      <div
        className="fixed inset-0 bg-[#16181D]/45 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className="relative z-10 flex h-full w-80 max-w-[90vw] flex-col bg-[#F8F7F4] shadow-2xl border-l border-[#16181D]/10">
        <div className="flex items-center justify-between gap-2 border-b border-[#16181D]/8 px-5 py-4">
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#0D7A5F]/10 text-[#0D7A5F] shrink-0">
              <Bell className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-base font-bold text-[#16181D] truncate">
                Notifications
              </h2>
              <p className="text-[11px] font-medium text-[#5A606D]">
                {unreadCount > 0 ? `${unreadCount} unread update${unreadCount > 1 ? 's' : ''}` : 'All caught up'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                data-testid="mark-all-notifications-read"
                aria-label="Mark all notifications read"
                className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#0D7A5F] shadow-xs hover:bg-[#FAF9F5]"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Read all</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close notifications"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#5A606D] shadow-xs hover:text-[#16181D]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
          {notifications.map((item) => {
            const isUnread = !item.defaultRead && !readSet.has(item.id);
            const isUrgent = item.priority === 'urgent';

            const iconBoxClass =
              item.kind === 'confirmation'
                ? 'bg-[#DC2626]/10 text-[#DC2626]'
                : item.kind === 'code_update' || item.kind === 'opponent_joined'
                  ? 'bg-[#0D7A5F]/12 text-[#0D7A5F]'
                  : item.kind === 'match_result'
                    ? 'bg-[#F59E0B]/15 text-[#B45309]'
                    : 'bg-slate-100 text-[#5A606D]';

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectNotification(item)}
                data-testid={`notification-item-${item.kind}`}
                className={`w-full rounded-2xl border p-3.5 text-left transition-colors ${
                  isUnread
                    ? 'border-[#0D7A5F]/25 bg-white shadow-xs hover:bg-[#FAF9F5]'
                    : 'border-[#16181D]/8 bg-white/80 hover:bg-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-xl shrink-0 ${iconBoxClass}`}
                  >
                    {item.kind === 'confirmation' ? (
                      <AlertCircle className="h-4 w-4" aria-hidden="true" />
                    ) : item.kind === 'code_update' ? (
                      <KeyRound className="h-4 w-4" aria-hidden="true" />
                    ) : item.kind === 'opponent_joined' ? (
                      <Swords className="h-4 w-4" aria-hidden="true" />
                    ) : item.kind === 'match_result' ? (
                      <Trophy className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Bell className="h-4 w-4" aria-hidden="true" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-bold leading-snug text-[#16181D]">
                        {item.title}
                      </p>
                      <span className="mt-0.5 flex items-center gap-1.5 shrink-0">
                        {isUnread && (
                          <span
                            aria-hidden="true"
                            className={`h-2 w-2 rounded-full ${
                              isUrgent ? 'bg-[#DC2626]' : 'bg-[#0D7A5F]'
                            }`}
                          />
                        )}
                        <span className="font-mono text-[10px] text-[#8C8F96]">
                          {formatAlertTime(item.createdAt)}
                        </span>
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[#5A606D]">
                      {item.message}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
