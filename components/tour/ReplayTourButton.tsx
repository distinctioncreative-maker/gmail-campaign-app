"use client";

export function ReplayTourButton({
  className = "btn-primary px-5 py-2.5 text-sm",
  label = "Take the tour",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <button onClick={() => window.dispatchEvent(new Event("outreach:start-tour"))} className={className}>
      {label}
    </button>
  );
}
