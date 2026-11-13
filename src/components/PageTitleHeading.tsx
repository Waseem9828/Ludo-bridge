interface PageTitleHeadingProps {
  title: string;
}

export function PageTitleHeading({ title }: PageTitleHeadingProps) {
  return (
    <div
      data-testid="page-title-heading"
      className="flex w-full items-center justify-center gap-3 sm:gap-5 py-0.5"
    >
      <div aria-hidden="true" className="flex min-w-6 flex-1 items-center gap-1">
        <span className="h-[1.5px] flex-1 rounded-full bg-gradient-to-r from-transparent via-[#0D7A5F]/45 to-[#064E3B]" />
        <span className="h-[2.5px] w-3 rounded-full bg-[#EE8E42]" />
      </div>
      <h1 className="shrink-0 text-center font-display text-xl sm:text-2xl font-bold tracking-tight text-[#16181D]">
        {title}
      </h1>
      <div aria-hidden="true" className="flex min-w-6 flex-1 items-center gap-1">
        <span className="h-[2.5px] w-3 rounded-full bg-[#EE8E42]" />
        <span className="h-[1.5px] flex-1 rounded-full bg-gradient-to-l from-transparent via-[#0D7A5F]/45 to-[#064E3B]" />
      </div>
    </div>
  );
}
