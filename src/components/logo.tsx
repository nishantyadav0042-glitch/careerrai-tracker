import Image from 'next/image';

// Natural aspect ratio (width/height) of /careerrai-monogram.png — the arrow
// mark is wider than it is tall, so a fixed-height render needs a matching
// width to avoid Next/Image's intrinsic-size mismatch warning.
const MONOGRAM_ASPECT = 600 / 558;

// `tagline` shows the "for the students, by the students" line under the
// wordmark — on by default, but suppress it where vertical space is tight.
export function Logo({ size = 'md', tagline = true }: { size?: 'sm' | 'md' | 'lg'; tagline?: boolean }) {
  const h = size === 'lg' ? 40 : size === 'sm' ? 22 : 28;
  const textSize = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-sm' : 'text-base';
  const showTag = tagline && size !== 'sm';

  return (
    <div className="flex items-center gap-2">
      <Image
        src="/careerrai-monogram.png"
        alt="CareerRai"
        width={Math.round(h * MONOGRAM_ASPECT)}
        height={h}
        style={{ height: h, width: 'auto' }}
        priority
      />
      <span className="flex flex-col justify-center">
        <span
          className={`${textSize} font-bold`}
          style={{ letterSpacing: '-0.02em', lineHeight: 1 }}
        >
          <span style={{ color: '#0f766e' }}>Career</span>
          {' '}
          <span style={{ color: '#ea580c' }}>राय</span>
        </span>
        {showTag && (
          <span className="mt-0.5 text-[8.5px] font-medium leading-none tracking-tight text-stone-400">
            for the students, by the students
          </span>
        )}
      </span>
    </div>
  );
}
