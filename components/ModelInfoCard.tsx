import React from 'react';
import { BookOpen, Lightbulb, Microscope } from 'lucide-react';
import type { ModelInfoProfile } from '../services/modelInfoProfiles';

interface ModelInfoCardProps {
  profile: ModelInfoProfile;
}

const CATEGORY_STYLES: Record<ModelInfoProfile['category'], string> = {
  化学: 'bg-violet-500/15 text-violet-200 border-violet-300/20',
  生物: 'bg-rose-500/15 text-rose-200 border-rose-300/20',
  地理: 'bg-emerald-500/15 text-emerald-200 border-emerald-300/20',
};

const ModelInfoCard: React.FC<ModelInfoCardProps> = ({ profile }) => (
  <section className="flex min-h-0 flex-1 flex-col" aria-label={`${profile.title}模型说明`}>
    <div className="relative h-36 shrink-0 overflow-hidden sm:h-44">
      <img src={profile.illustration} alt={`${profile.title}示意图`} className="h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#06111d] via-[#06111d]/15 to-transparent" />
      <span className={`absolute bottom-3 left-4 rounded-full border px-2.5 py-1 text-[10px] font-black tracking-widest ${CATEGORY_STYLES[profile.category]}`}>
        {profile.category}模型
      </span>
    </div>

    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-6 pt-4 [scrollbar-color:rgba(34,211,238,0.24)_transparent]">
      <header>
        <h2 className="text-2xl font-black tracking-tight text-white">{profile.title}</h2>
        <p className="mt-1 text-xs font-bold tracking-wide text-cyan-200">{profile.subtitle}</p>
      </header>
      <p className="text-sm leading-7 text-slate-300">{profile.description}</p>

      <section aria-label="关键数据">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">
          <BookOpen size={13} /> 关键数据
        </div>
        <dl className="grid grid-cols-1 gap-2 2xl:grid-cols-2">
          {profile.metrics.map((metric) => (
            <div key={metric.label} className="rounded-xl border border-white/10 bg-white/[0.045] px-3 py-3">
              <dt className="text-[10px] font-bold tracking-wider text-slate-400">{metric.label}</dt>
              <dd className="mt-1 text-xs font-semibold leading-5 text-slate-200">{metric.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="space-y-2" aria-label="知识提示">
        {profile.tips.map((tip, index) => {
          const Icon = index === 0 ? Microscope : Lightbulb;
          return (
            <div key={tip.title} className="flex gap-3 rounded-xl border border-cyan/10 bg-cyan-400/[0.05] p-3.5">
              <Icon size={15} className="mt-0.5 shrink-0 text-cyan-300" />
              <p className="text-xs leading-5 text-slate-300"><b className="mr-1 text-cyan-300">{tip.title}</b>{tip.content}</p>
            </div>
          );
        })}
      </section>
    </div>
  </section>
);

export default ModelInfoCard;
