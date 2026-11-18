"use client";

/** Horizontal milestone stepper for the run pipeline:
 *  done (check + green) · current (pulsing ring) · paused (amber) · todo (hollow). */
export function Stepper({
  steps,
}: {
  steps: Array<{ label: string; state: "done" | "current" | "paused" | "todo"; hint?: string }>;
}) {
  return (
    <div className="stepper" role="list" aria-label="run milestones">
      {steps.map((step, i) => (
        <div className="step" role="listitem" key={i}>
          <div className="step-line-wrap">
            {i > 0 && <div className={`step-line ${steps[i - 1].state === "done" ? "done" : ""}`} />}
            <div className={`step-dot ${step.state}`}>
              {step.state === "done" ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M2 6.5 4.8 9 10 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : null}
            </div>
          </div>
          <div className="step-label">
            <div>{step.label}</div>
            {step.hint ? <small>{step.hint}</small> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
