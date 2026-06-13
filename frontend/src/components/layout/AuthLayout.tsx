import { Logo } from '../ui/Logo';
import LoginOrbit from '@/assets/decor/login-orbit.svg?react';

/**
 * Shared two-column shell for the unauthenticated screens (login, set
 * password, …). Left: the editorial ink hero. Right: a centred form column
 * (max-w-md) into which each page drops its own form via `children`.
 */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-paper">
      {/* Editorial hero — ink-black with serif italic statement */}
      <section className="relative bg-ink text-white px-8 py-12 md:w-1/2 md:px-16 md:py-20 flex flex-col justify-between overflow-hidden">
        <Logo height={60} variant="light" />

        <div className="relative z-10">
          <div className="text-[11px] tracking-[0.2em] uppercase text-white/50 mb-4">
            The self-hosted PM tool · v1.0
          </div>
          <h1 className="font-serif italic text-[44px] md:text-[60px] leading-[1.05] tracking-tight">
            Track work.<br />
            <span className="inline-flex items-baseline gap-2">Own the data.<span className="text-lilac">_</span></span>
          </h1>
          <p className="mt-6 text-[14px] text-white/70 max-w-md">
            Trackero runs on your boxes, behind your auth, alongside the rest of your
            stack. No seat counts. No vendor lock-in. No telemetry pinging home.
          </p>

          <div className="mt-10 grid grid-cols-3 gap-6 max-w-md">
            <Stat n="100%" label="OPEN SOURCE · AGPL-3" />
            <Stat n="<12 ms" label="P50 BOARD RESPONSE" />
            <Stat n="1 cmd" label="DOCKER COMPOSE UP" />
          </div>
        </div>

        {/* Editorial circle accent */}
        <LoginOrbit className="absolute right-[-60px] bottom-[-80px] w-[480px] h-[480px] opacity-30 pointer-events-none hidden md:block" aria-hidden />

        <div className="relative z-10 mt-16 md:mt-0 text-[11px] tracking-[0.15em] uppercase text-white/40">
          Built by{' '}
          <a href="https://blueagate.in" target="_blank" rel="noopener noreferrer" className="text-white/60 hover:text-white/80 transition-colors">
            BlueAgate
          </a>
        </div>
      </section>

      {/* Form column */}
      <section className="md:w-1/2 px-6 py-10 md:px-16 md:py-20 flex items-center justify-center">
        <div className="w-full max-w-md">{children}</div>
      </section>
    </div>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div>
      <div className="font-serif italic text-[28px] leading-none text-white">{n}</div>
      <div className="mt-2 text-[10px] tracking-[0.15em] uppercase text-white/40">{label}</div>
    </div>
  );
}
