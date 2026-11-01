import React from 'react';
import { api } from '../lib/api';
import { SyllabusExplorer } from '../components/SyllabusExplorer';
import type { SyllabusVersion } from '../../../shared/types';
import { Badge } from '../components/ui';

export function RtuPage() {
  const [version, setVersion] = React.useState<SyllabusVersion | null>(null);

  React.useEffect(() => {
    api.syllabus.versions()
      .then(list => setVersion(list.find(v => v.exam_type === 'RTU') ?? null))
      .catch(() => setVersion(null));
  }, []);

  return (
    <SyllabusExplorer
      examType="RTU"
      title="RTU Kota — B.Tech Mechanical Engineering"
      description="Subjects, units and topics transcribed from the official RTU syllabus PDF. Mark progress, attach your notes, and see how each topic relates to GATE."
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
            <span>Source: {version.source_doc ?? '—'}</span>
            <span>Retrieved: {version.retrieved_at ?? '—'}</span>
            <span>{version.subject_count} subjects · {version.topic_count} topics</span>
            <span className="text-[10px]" style={{ color: 'var(--color-faint)' }}>
              Only III Semester is present in the source document.
            </span>
          </div>
        )
      }
    />
  );
}
