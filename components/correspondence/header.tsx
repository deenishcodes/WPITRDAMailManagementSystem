'use client';
import { RoleSignOut } from '@/components/role-signout';
import { Bell, LogOut, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { NotificationRow } from '@/lib/correspondence/types';
import { formatWhen } from '@/lib/correspondence/client';

export function CorrespondenceHeader({
  title,
  subtitle,
  notifications,
  onMarkRead,
}: {
  title: string;
  subtitle?: string;
  notifications: NotificationRow[];
  onMarkRead: (id: string) => void;
}) {
  const unread = notifications.filter((n) => !n.readAt);
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b bg-background/95 px-6 py-4 backdrop-blur">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Mail size={16} /> Main Management System
        </div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Notifications" className="relative">
              <Bell size={18} />
              {unread.length > 0 && (
                <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] text-white">
                  {unread.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="border-b px-4 py-2 text-sm font-medium">Notifications</div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">No notifications yet</p>
              )}
              {notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => !n.readAt && onMarkRead(n.id)}
                  className={
                    'block w-full border-b px-4 py-3 text-left text-sm last:border-0 hover:bg-muted ' +
                    (n.readAt ? 'text-muted-foreground' : 'font-medium')
                  }
                >
                  <p>{n.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatWhen(n.createdAt)}</p>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <RoleSignOut/>
      </div>
    </header>
  );
}

export function LetterStatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, ' ');
  const variant =
    status === 'done'
      ? 'secondary'
      : status === 'returned_to_hod'
        ? 'destructive'
        : status === 'forward_pending'
          ? 'warn'
          : status === 'registered'
            ? 'outline'
            : 'default';
  return (
    <span
      className={
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium capitalize ' +
        (variant === 'secondary'
          ? 'border-transparent bg-secondary text-secondary-foreground'
          : variant === 'destructive'
            ? 'border-transparent bg-destructive text-white'
            : variant === 'warn'
              ? 'border-transparent bg-amber-500 text-white'
              : variant === 'outline'
                ? 'border-border text-foreground'
                : 'border-transparent bg-primary text-primary-foreground')
      }
    >
      {label}
    </span>
  );
}
