import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  label: string;
  children: React.ReactNode;
}

export function Tooltip({ label, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLSpanElement>(null);

  const show = () => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({
      top: rect.top - 6,
      left: rect.left + rect.width / 2,
    });
    setVisible(true);
  };

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={() => setVisible(false)}
        className="inline-flex"
      >
        {children}
      </span>
      {visible && createPortal(
        <div
          className="fixed z-[200] px-2.5 py-1.5 rounded-md text-[16px] font-medium text-white bg-neutral-700 dark:bg-dneutral-50 dark:text-dneutral-700 whitespace-nowrap pointer-events-none shadow-lg"
          style={{
            top: pos.top,
            left: pos.left,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {label}
        </div>,
        document.body,
      )}
    </>
  );
}
