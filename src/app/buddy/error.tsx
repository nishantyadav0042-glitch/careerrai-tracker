'use client';

export default function BuddyError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-stone-50 p-6 text-center">
      <p className="text-stone-500 text-sm mb-4">Something went wrong. Tap to retry.</p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-teal-700 text-white rounded-lg text-sm font-semibold"
      >
        Retry
      </button>
    </div>
  );
}
