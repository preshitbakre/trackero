import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../api/client';
import { getSocket } from '../../lib/socket';

interface NotificationItem {
  id: number;
  type: string;
  referenceType: string;
  referenceId: number;
  projectId: number | null;
  title: string;
  body: string | null;
  isRead: boolean;
  createdAt: string;
}

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadUnreadCount();
    const socket = getSocket();
    socket.on('notification:new', handleNewNotification);
    return () => { socket.off('notification:new', handleNewNotification); };
  }, []);

  useEffect(() => {
    if (showDropdown) loadNotifications();
  }, [showDropdown]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleNewNotification = (notif: NotificationItem) => {
    setUnreadCount((c) => c + 1);
    setNotifications((prev) => [notif, ...prev].slice(0, 20));
    // Show toast
    showToast(notif.title);
  };

  const loadUnreadCount = async () => {
    try {
      const { data } = await apiClient.get('/notifications/unread-count');
      setUnreadCount(data.data.count);
    } catch {}
  };

  const loadNotifications = async () => {
    try {
      const { data } = await apiClient.get('/notifications?limit=20');
      setNotifications(data.data.list);
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await apiClient.put('/notifications/read-all');
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {}
  };

  const handleClick = async (notif: NotificationItem) => {
    if (!notif.isRead) {
      await apiClient.put(`/notifications/${notif.id}/read`).catch(() => {});
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    setShowDropdown(false);

    switch (notif.referenceType) {
      case 'task':
        if (notif.projectId) navigate(`/projects/${notif.projectId}/board`);
        break;
      case 'sprint':
        if (notif.projectId) navigate(`/projects/${notif.projectId}/sprints`);
        break;
      case 'comment':
        if (notif.projectId) navigate(`/projects/${notif.projectId}/board`);
        break;
      case 'project':
        navigate(`/projects/${notif.referenceId}/board`);
        break;
      default:
        navigate('/dashboard');
    }
  };

  const showToast = (message: string) => {
    // Simple toast via DOM
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-4 right-4 z-50 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-4 py-3 rounded-lg shadow-lg text-sm max-w-xs animate-slide-in';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="relative p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {showDropdown && (
        <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50 max-h-96 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-50">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-brand hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-400">No notifications</div>
            ) : (
              notifications.map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => handleClick(notif)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 ${
                    !notif.isRead ? 'bg-brand/5' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!notif.isRead && <span className="w-2 h-2 mt-1.5 rounded-full bg-brand flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 dark:text-gray-50 truncate">{notif.title}</p>
                      {notif.body && <p className="text-xs text-gray-500 truncate">{notif.body}</p>}
                      <p className="text-xs text-gray-400 mt-0.5">{timeAgo(notif.createdAt)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
