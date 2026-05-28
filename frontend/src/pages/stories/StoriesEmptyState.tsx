interface Props {
  canEdit: boolean;
  onCreate: () => void;
}

const STEPS = [
  { n: '01', title: 'Write it as a sentence', body: 'Subject, verb, outcome. Skip the implementation.' },
  { n: '02', title: 'Add acceptance criteria', body: 'Given / when / then. Three is usually enough.' },
  { n: '03', title: 'Break it into tasks', body: "When you're ready to plan. Not before." },
];

/** Editorial zero-state for the Stories page (see `Stories _ empty state.png`). */
export function StoriesEmptyState({ canEdit, onCreate }: Props) {
  return (
    <div className="px-[28px] py-6 flex flex-col lg:flex-row gap-12 items-start">
      {/* LEFT */}
      <div className="flex-1 max-w-[520px]">
        <div className="font-serif text-[48px] leading-[1.05] text-text">No stories</div>
        <div className="font-serif italic text-[48px] leading-[1.05] text-text mb-6">
          — <span className="not-italic">yet.</span> —
        </div>

        <p className="text-[14px] text-mute mb-8 max-w-[480px]">
          A <span className="text-text font-medium">story</span> is a single user-facing outcome.
          Not a ticket. Not a checklist. Something a person opens Trackero and writes in the form:{' '}
          <span className="font-serif italic text-faint">"As a … , I can …"</span>
        </p>

        <div className="mb-8">
          {STEPS.map((s) => (
            <div key={s.n} className="flex gap-5 border-t border-rule pt-5 mt-5 first:mt-0">
              <span className="font-serif text-[28px] text-faint leading-none w-[40px]">{s.n}</span>
              <div>
                <div className="text-[15px] font-semibold text-text">{s.title}</div>
                <div className="text-[13px] text-mute mt-0.5">{s.body}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {canEdit && (
            <button type="button" onClick={onCreate} className="btn btn-accent">
              Write your first story →
            </button>
          )}
          <button
            type="button"
            onClick={() => window.open('https://www.atlassian.com/agile/project-management/user-stories', '_blank', 'noopener')}
            className="btn-ghost"
          >
            See examples
          </button>
        </div>
      </div>

      {/* RIGHT preview card */}
      <div className="w-full lg:flex-1 bg-card border border-rule p-6">
        <div className="smallcaps mb-4">What it'll look like</div>
        <div className="font-serif italic text-[20px] text-mute mb-5">
          "As an event PM, I can export the door list as a PDF…"
        </div>
        {[
          'Given a sprint with attendees',
          'When I click Export → Door list',
          'Then I get a PDF in under 8 seconds',
        ].map((line) => (
          <div key={line} className="flex items-center gap-2.5 py-1.5 text-[13px] text-mute">
            <span className="w-3.5 h-3.5 border border-rule flex-shrink-0" aria-hidden />
            <span>{line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
