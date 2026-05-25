import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../../api/client';
import { getSocket } from '../../lib/socket';
import { toast } from '../common/Toast';

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
    toast(notif.title);
  };

  const loadUnreadCount = async () => {
    try {
      const { data } = await apiClient.get('/notifications/unread-count');
      setUnreadCount(data.data.count);
    } catch (err) { console.error(err); }
  };

  const loadNotifications = async () => {
    try {
      const { data } = await apiClient.get('/notifications?limit=20');
      setNotifications(data.data.list);
    } catch (err) { console.error(err); }
  };

  const markAllRead = async () => {
    try {
      await apiClient.put('/notifications/read-all');
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (err: any) {
      toast(err.response?.data?.message || 'Failed to mark all read', 'error');
    }
  };

  const handleClick = async (notif: NotificationItem) => {
    if (!notif.isRead) {
      await apiClient.put(`/notifications/${notif.id}/read`).catch((err) => { console.error(err); });
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    setShowDropdown(false);

    switch (notif.referenceType) {
      case 'work_item':
      case 'task':
        if (notif.projectId) navigate(`/projects/${notif.projectId}/tasks/${notif.referenceId}`);
        break;
      case 'sprint':
        if (notif.projectId) navigate(`/projects/${notif.projectId}/sprints`);
        break;
      case 'comment':
        if (notif.projectId) navigate(`/projects/${notif.projectId}/tasks/${notif.referenceId}`);
        break;
      case 'project':
        navigate(`/projects/${notif.referenceId}/board`);
        break;
      default:
        navigate('/dashboard');
    }
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
        className="relative p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-dneutral-200 text-neutral-400 dark:text-dneutral-400"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-danger text-white text-[10px] leading-none font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {showDropdown && (
        <div className="dropdown-panel absolute right-0 mt-2 w-80 bg-white dark:bg-dneutral-200 z-50 max-h-96 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-200 dark:border-dneutral-300">
            <span className="text-[16px] font-medium text-neutral-700 dark:text-dneutral-700">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-[16px] text-lilac-dark hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1 custom-scrollbar">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-[16px] text-neutral-400">No notifications</div>
            ) : (
              notifications.map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => handleClick(notif)}
                  className={`w-full text-left px-4 py-3 border-b border-neutral-100 dark:border-dneutral-200 hover:bg-neutral-100 dark:hover:bg-dneutral-200 ${
                    !notif.isRead ? 'bg-lilac-tint dark:bg-peri-dm/20' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!notif.isRead && <span className="w-2 h-2 mt-1.5 rounded-full bg-lilac flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-[16px] text-neutral-700 dark:text-dneutral-700 truncate">{notif.title}</p>
                      {notif.body && <p className="text-[16px] text-neutral-400 truncate">{notif.body}</p>}
                      <p className="text-[16px] text-neutral-300 dark:text-dneutral-300 mt-0.5">{timeAgo(notif.createdAt)}</p>
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
