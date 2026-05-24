import { Link } from 'react-router-dom';
import { Eyebrow } from '../ui';

/**
 * Phase 9 frontend slot for project-level notification overrides.
 * Per-user prefs live under /profile (Phase 8); per-project overrides
 * (e.g. "mute all notifications from BST") are a v2 feature. This tab
 * documents that today and links to where per-user prefs live so the
 * navigation entry isn't a dead end.
 */
export function NotificationsTab() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif italic text-[28px] text-ink">Notifications</h2>
        <p className="text-mute mt-1 text-[14px]">
          When this project pings you, where it goes.
        </p>
      </div>

      <div className="rounded-lg border border-rule bg-card p-5">
        <Eyebrow>Per-user preferences</Eyebrow>
        <p className="text-[14px] text-text mt-1.5">
          Your channels (in-app, email, push) are set globally in your{' '}
          <Link to="/profile?tab=notifications" className="text-lilac-dark hover:underline font-medium">
            Profile
          </Link>{' '}
          so the same toggles apply on every project.
        </p>
      </div>

      <div className="rounded-lg border border-dashed border-rule bg-paper/40 p-5">
        <Eyebrow>Project overrides</Eyebrow>
        <p className="text-[14px] text-mute italic mt-1.5">
          Per-project mute/route overrides land in v2. Until then, project-level
          changes are made by the workspace admin from Instance settings.
        </p>
      </div>
    </div>
  );
}
