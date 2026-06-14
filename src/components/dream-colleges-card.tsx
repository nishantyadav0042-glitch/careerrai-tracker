'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { GraduationCap } from 'lucide-react';

const COLLEGES = [
  'IIM Ahmedabad', 'IIM Bangalore', 'IIM Calcutta',
  'IIM Lucknow', 'IIM Kozhikode', 'IIM Indore',
  'XLRI', 'FMS Delhi', 'MDI Gurgaon', 'IIFT', 'SPJIMR',
];

interface DreamCollegesCardProps {
  initial: string[];
}

export function DreamCollegesCard({ initial }: DreamCollegesCardProps) {
  const supabase = createClient();
  const [selected, setSelected] = useState<string[]>(initial);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const toggle = (college: string) => {
    setSelected((prev) =>
      prev.includes(college) ? prev.filter((c) => c !== college) : [...prev, college]
    );
  };

  const save = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('profiles').update({ dream_colleges: selected }).eq('id', user.id);
    }
    setSaving(false);
    setEditing(false);
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Dream colleges</div>
        <button
          onClick={() => editing ? save() : setEditing(true)}
          disabled={saving}
          className="text-xs font-semibold text-orange-600 hover:text-orange-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : editing ? 'Save' : 'Edit'}
        </button>
      </div>

      {editing ? (
        <div className="flex flex-wrap gap-2">
          {COLLEGES.map((college) => (
            <button
              key={college}
              onClick={() => toggle(college)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all ${
                selected.includes(college)
                  ? 'bg-stone-900 text-white'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              {selected.includes(college) ? '✓ ' : ''}{college}
            </button>
          ))}
        </div>
      ) : selected.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selected.map((college) => (
            <span key={college} className="flex items-center gap-1 text-xs bg-stone-900 text-white px-3 py-1.5 rounded-full font-medium">
              <GraduationCap className="w-3 h-3" />
              {college}
            </span>
          ))}
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="w-full rounded-xl border-2 border-dashed border-stone-200 p-4 text-center"
        >
          <GraduationCap className="w-5 h-5 text-stone-400 mx-auto mb-1.5" />
          <p className="text-sm font-semibold text-stone-700">Add your dream colleges</p>
          <p className="text-xs text-stone-400 mt-0.5">Powers your trajectory wall on the tracker</p>
        </button>
      )}
    </Card>
  );
}
