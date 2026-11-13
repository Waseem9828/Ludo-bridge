export function TermsPage() {
  return (
    <div className="w-full px-4 py-5 sm:px-8 sm:py-8 space-y-6" data-testid="terms-page">
      <div className="space-y-1">
        <p className="text-xs font-semibold text-[#0D7A5F]">Platform Guidelines</p>
        <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#16181D]">
          Terms &amp; Conditions
        </h1>
        <p className="text-xs sm:text-sm text-[#5A606D]">
          Rules governing 2-player matchmaking and Ludo King room coordination on LudoBridge.
        </p>
      </div>

      <section className="rounded-2xl bg-white p-5 sm:p-7 shadow-surface-card space-y-5 text-sm leading-relaxed text-[#454A54]">
        <div>
          <h2 className="font-display text-base font-bold text-[#16181D]">
            1. Matchmaking &amp; Room Handoff Scope
          </h2>
          <p className="mt-1.5">
            LudoBridge operates strictly as a 2-player matchmaking and private room code coordination platform. All actual board gameplay, dice rolls, and token movements take place inside the official Ludo King mobile application.
          </p>
        </div>

        <hr className="border-[#16181D]/8" />

        <div>
          <h2 className="font-display text-base font-bold text-[#16181D]">
            2. Fair Play &amp; Room Code Accuracy
          </h2>
          <p className="mt-1.5">
            The host player is responsible for creating a Classic 2-player Play With Friends room inside Ludo King and sharing the exact room code. Both participants must confirm readiness and record the accurate outcome after completion.
          </p>
        </div>

        <hr className="border-[#16181D]/8" />

        <div>
          <h2 className="font-display text-base font-bold text-[#16181D]">
            3. Eligibility &amp; Conduct
          </h2>
          <p className="mt-1.5">
            Users must be 18 years or older and comply with local laws applicable in their jurisdiction. Abusive chat, tampering with room codes, or falsifying match outcomes may lead to immediate removal of lobby access.
          </p>
        </div>
      </section>
    </div>
  );
}
