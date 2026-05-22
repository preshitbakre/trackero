import { useRole } from '../../hooks/useRole';

export function ReadOnlyBanner() {
  const { isReadOnly } = useRole();
  if (!isReadOnly) return null;

  return (
    <div className="bg-tan-light dark:bg-tan-dm/30 border-b border-tan dark:border-tan-dm px-4 py-1.5 text-[14px] text-neutral-600 dark:text-tan-dm text-center">
      You have view-only access to this project
    </div>
  );
}
