import { useState } from 'react';
import { Eyebrow } from '../ui/Eyebrow';
import { Button } from '../ui/Button';

const STEPS = [
  { n: '01', title: 'Name it', sub: 'A one-line title and a one-paragraph why.' },
  { n: '02', title: 'Set a target', sub: 'Optional. A target date keeps the team honest.' },
  { n: '03', title: 'Break it up', sub: "Add stories underneath. They'll inherit the epic's color." },
];

/** Zero-epics empty state: editorial copy + 3-step guide + preview card. */
export function EpicsEmptyState({ onCreate }: { onCreate: () => void }) {
  const [showWhat, setShowWhat] = useState(false);
  return (
    <div className="px-[28px] py-10 grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
      {/* Left — guide */}
      <div>
        <h2 className="font-serif text-[56px] leading-[1.05] text-text">
          No epics
          <br />
          <span className="text-faint">—</span> yet. <span className="text-faint">—</span>
        </h2>
        <p className="mt-4 text-[15px] text-mute max-w-[460px]">
          An <strong className="text-text font-semibold">epic</strong> is the largest unit of work in Trackero — a
          multi-sprint initiative that earns its own page, its own roadmap slot, and its own celebration when it
          ships.
        </p>

        <div className="mt-8">
          {STEPS.map((s) => (
            <div key={s.n} className="flex items-start gap-4 py-4 border-t border-rule">
              <span className="font-serif text-[22px] text-faint w-8 shrink-0">{s.n}</span>
              <div>
                <p className="text-[14px] font-semibold text-text">{s.title}</p>
                <p className="text-[13px] text-mute">{s.sub}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center gap-4">
          <Button onClick={onCreate}>Create your first epic →</Button>
          <button
            type="button"
            onClick={() => setShowWhat((v) => !v)}
            className="text-[14px] text-lilac hover:underline"
          >
            What's an epic?
          </button>
        </div>
        {showWhat && (
          <p className="mt-4 text-[14px] text-mute max-w-[460px] border-l-2 border-rule pl-3">
            Epics group many sprints of related work under one page. Create stories beneath an epic and
            its progress, timeline, and roadmap slot roll up automatically — then celebrate when it ships.
          </p>
        )}
      </div>

      {/* Right — preview */}
      <div className="bg-card shadow-[0_2px_8px_rgba(0,0,0,0.06)] p-6">
        <Eyebrow size="sm">What it'll look like</Eyebrow>
        <div className="relative mt-4 pl-5">
          <span className="absolute left-0 top-0 bottom-0 w-1 bg-lilac" aria-hidden />
          <p className="font-serif text-[18px] text-mute">Your first big initiative…</p>
          <div className="mt-4 h-1.5 bg-rule" />
          <p className="mt-3 text-[11px] tracking-[0.14em] uppercase text-faint">0 / 0 items · awaiting plan</p>
        </div>
      </div>
    </div>
  );
}
