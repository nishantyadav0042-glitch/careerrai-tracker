import Image from 'next/image';

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const h = size === 'lg' ? 40 : size === 'sm' ? 22 : 28;
  const textSize = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-sm' : 'text-base';

  return (
    <div className="flex items-center gap-2">
      <Image
        src="/careerrai-monogram.png"
        alt="CareerRai"
        width={h}
        height={h}
        style={{ height: h, width: 'auto' }}
        priority
      />
      <span
        className={`${textSize} font-bold`}
        style={{ letterSpacing: '-0.02em', lineHeight: 1 }}
      >
        <span style={{ color: '#0f766e' }}>Career</span>
        {' '}
        <span style={{ color: '#ea580c' }}>राय</span>
      </span>
    </div>
  );
}
