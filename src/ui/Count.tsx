const DIGITS = [...'0123456789'];

// Tiap digit = kolom 0–9 yang digeser translateY; kunci dari kanan supaya nilai tempat tetap.
export function Count({ value }: { value: number }) {
  const s = String(value);
  return (
    <span className="count">
      <span className="sr-only">{s}</span>
      {[...s].map((c, i) => {
        const key = s.length - i;
        if (c < '0' || c > '9') return <span key={key} aria-hidden="true">{c}</span>;
        return (
          <span key={key} className="count-d" aria-hidden="true">
            <span style={{ transform: `translateY(${-1.2 * Number(c)}em)` }}>
              {DIGITS.map((d) => <span key={d}>{d}</span>)}
            </span>
          </span>
        );
      })}
    </span>
  );
}
