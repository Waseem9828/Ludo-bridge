import { PageTitleHeading } from './PageTitleHeading';

export function RefundPolicyPage() {
  return (
    <div className="w-full px-4 py-5 sm:px-8 sm:py-8 space-y-6" data-testid="refund-policy-page">
      <PageTitleHeading title="Refund Policy" />

      <section className="rounded-2xl bg-white p-5 sm:p-7 shadow-surface-card space-y-5 text-sm leading-relaxed text-[#454A54]">
        <div>
          <h2 className="font-display text-base font-bold text-[#16181D]">
            1. Open Battle Cancellation
          </h2>
          <p className="mt-1.5">
            You may cancel and delete any Open Battle you posted at any time before a second player clicks Play to join the room. Once deleted, the waiting challenge is immediately removed from the lobby.
          </p>
        </div>

        <hr className="border-[#16181D]/8" />

        <div>
          <h2 className="font-display text-base font-bold text-[#16181D]">
            2. Unstarted or Invalid Room Codes
          </h2>
          <p className="mt-1.5">
            If the host fails to share a valid Ludo King room code or either player leaves the lobby before marking ready inside Ludo King, the battle is voided without recording a winner.
          </p>
        </div>

        <hr className="border-[#16181D]/8" />

        <div>
          <h2 className="font-display text-base font-bold text-[#16181D]">
            3. Completed Matches
          </h2>
          <p className="mt-1.5">
            Once a round has started inside the Ludo King app and a winner has been mutually recorded in the battle room, the result is final and logged to the match history ledger.
          </p>
        </div>
      </section>
    </div>
  );
}
