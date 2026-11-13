import { PageTitleHeading } from './PageTitleHeading';

export function GstPolicyPage() {
  return (
    <div className="w-full px-4 py-5 sm:px-8 sm:py-8 space-y-6" data-testid="gst-policy-page">
      <PageTitleHeading title="GST Policy" />

      <section className="rounded-2xl bg-white p-5 sm:p-7 shadow-surface-card space-y-5 text-sm leading-relaxed text-[#454A54]">
        <div>
          <h2 className="font-display text-base font-bold text-[#16181D]">
            1. Platform Fee &amp; Tax Applicability
          </h2>
          <p className="mt-1.5">
            Any applicable Goods and Services Tax (GST) is calculated strictly in accordance with prevailing statutory tax regulations on eligible platform service charges, where applicable.
          </p>
        </div>

        <hr className="border-[#16181D]/8" />

        <div>
          <h2 className="font-display text-base font-bold text-[#16181D]">
            2. Transparent Battle Amounts
          </h2>
          <p className="mt-1.5">
            Every open and running battle clearly displays the declared battle amount before you choose to accept or host a 2-player room, with zero hidden surcharges during Ludo King room handoff.
          </p>
        </div>

        <hr className="border-[#16181D]/8" />

        <div>
          <h2 className="font-display text-base font-bold text-[#16181D]">
            3. Recordkeeping
          </h2>
          <p className="mt-1.5">
            Completed match summaries—including battle code, Ludo King room reference, participants, and timestamps—remain accessible in the History section for clear verification.
          </p>
        </div>
      </section>
    </div>
  );
}
