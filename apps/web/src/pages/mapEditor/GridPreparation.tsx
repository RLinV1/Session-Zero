export function GridPreparation({ label, onSkip }: { label: string; onSkip: () => void }) {
  return <div className="map-grid-preparation">
    <span className="map-grid-spinner" aria-hidden="true" />
    <p role="status" aria-live="polite" aria-atomic="true">{label}</p>
    <button type="button" className="secondary" onClick={onSkip}>Set up manually</button>
  </div>;
}
