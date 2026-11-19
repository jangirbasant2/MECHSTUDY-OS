import React from 'react';
import { api } from '../lib/api';
import { SyllabusExplorer } from '../components/SyllabusExplorer';
import type { SyllabusVersion } from '../../../shared/types';
import { Badge } from '../components/ui';
import { ExternalLink } from 'lucide-react';

export function IitPage() {
  const [version, setVersion] = React.useState<SyllabusVersion | null>(null);

  React.useEffect(() => {
    api.syllabus.versions()
      .then(list => setVersion(list.find(v => v.exam_type === 'IIT') ?? null))
      .catch(() => setVersion(null));
  }, []);

  return (
    <SyllabusExplorer
      examType="IIT"
      title="IIT JEE Advanced Syllabus (Physics, Chemistry, Mathematics)"
      description="The official IIT JEE curriculum covering Physics, Chemistry, and Mathematics. Track chapters, problem practice, and concepts with scheduled revision."
      versionInfo={
        version && (
          <div
            className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-3 py-2 text-[11px]"
            style={{ background: 'var(--color-panel2)', color: 'var(--color-muted)' }}
          >
            <span className="font-medium" style={{ color: 'var(--color-text)' }}>{version.name}</span>
            <Badge color={version.verification === 'VERIFIED' ? 'var(--color-accent2)' : 'var(--color-warn)'}>
              {version.verification}
            </Badge>
            <span>{version.subject_count} subjects · {version.topic_count} topics</span>
            <span>Retrieved: {version.retrieved_at ?? '—'}</span>
            {version.source_url && (
              <button
                className="inline-flex items-center gap-1 text-[10px] underline"
                style={{ color: 'var(--color-accent)' }}
                onClick={() => void api.app.openExternal(version.source_url!)}
                title={version.source_url}
              >
                <ExternalLink size={10} /> official source
              </button>
            )}
            {version.notes && (
              <span className="w-full text-[10px] leading-snug" style={{ color: 'var(--color-faint)' }}>
                {version.notes}
              </span>
            )}
          </div>
        )
      }
    />
  );
}
