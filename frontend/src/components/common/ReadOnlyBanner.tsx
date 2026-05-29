import { useRole } from '../../hooks/useRole';

export function ReadOnlyBanner() {
  const { isReadOnly } = useRole();
  if (!isReadOnly) return null;

  return (
    <div className="bg-tan-light border-b border-tan px-4 py-1.5 text-[14px] text-neutral-600 text-center">
      You have view-only access to this project
    </div>
  );
}
