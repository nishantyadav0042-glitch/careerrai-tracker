'use client';

import { useState } from 'react';
import { Share2, Check } from 'lucide-react';
import { SITE_HOST } from '@/lib/site';

interface ShareProgressButtonProps {
  daysLogged: number;
  bestStreak: number;
  percentile: number | null;
}

export function ShareProgressButton({ daysLogged, bestStreak, percentile }: ShareProgressButtonProps) {
  const [shared, setShared] = useState(false);

  const shareText = [
    `🔥 I've been preparing for CAT for ${daysLogged} days with my IIM buddy on CareerRai!`,
    bestStreak > 1 ? `📈 Best streak: ${bestStreak} days` : null,
    percentile ? `🎯 Latest percentile: ${Math.round(percentile)}%ile` : null,
    '',
    SITE_HOST,
  ]
    .filter((l) => l !== null)
    .join('\n');

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text: shareText });
        setShared(true);
        setTimeout(() => setShared(false), 2000);
        return;
      } catch {
        // user cancelled or share failed — fall through to WhatsApp
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, '_blank');
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  };

  return (
    <button
      onClick={handleShare}
      className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white rounded-lg font-medium text-sm hover:bg-emerald-700 transition-colors"
    >
      {shared ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
      {shared ? 'Shared!' : 'Share my progress'}
    </button>
  );
}
