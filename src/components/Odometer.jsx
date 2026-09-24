// Single digit column that scrolls through 0-9. The column's position is
// derived straight from `digit`; the CSS transition does the animation, so a
// new value starts moving immediately instead of after a state round-trip.
function OdometerDigit({ digit, duration = 500 }) {
  const currentDigit = parseInt(digit, 10) || 0;

  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: '0.65em',
        height: '1.2em',
      }}
    >
      <div
        className="absolute inset-0 flex flex-col items-center transition-transform ease-out"
        style={{
          transform: `translateY(${-currentDigit * 1.2}em)`,
          transitionDuration: `${duration}ms`,
        }}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <span
            key={d}
            className="flex items-center justify-center"
            style={{ height: '1.2em', lineHeight: '1.2em' }}
          >
            {d}
          </span>
        ))}
      </div>
    </div>
  );
}

// Comma separator
function OdometerSeparator() {
  return (
    <span
      className="inline-block text-center opacity-60"
      style={{ width: '0.3em' }}
    >
      ,
    </span>
  );
}

export default function Odometer({ value, duration = 500, className = '' }) {
  // Format number and split into digits
  const formattedValue = value.toLocaleString('en-US');
  const characters = formattedValue.split('');

  return (
    <div className={`inline-flex items-center font-mono ${className}`}>
      {characters.map((char, index) => {
        if (char === ',') {
          return <OdometerSeparator key={`sep-${index}`} />;
        }
        return (
          <OdometerDigit
            key={`digit-${characters.length - index}`}
            digit={char}
            duration={duration}
          />
        );
      })}
    </div>
  );
}
