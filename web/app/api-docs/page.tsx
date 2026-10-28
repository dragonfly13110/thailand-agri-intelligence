import type { Metadata } from 'next';
import { ApiPlayground } from '@/components/api-playground';
import styles from '@/components/api-playground.module.css';
import { Shell } from '@/components/shell';
import { API_ENDPOINTS, API_GROUPS } from '@/lib/hub/api-catalog';

export const metadata: Metadata = {
  title: 'API สำหรับนักพัฒนา',
  description: 'ดู endpoint และสัญญา response ของ Thailand Agricultural Data Hub พร้อมทดลองเรียก API แบบอ่านอย่างเดียว',
};

const ACCESS_LABELS = {
  approved_public: 'เผยแพร่ตัวเลขได้เมื่อผ่านเงื่อนไขของ route',
  metadata_only: 'metadata เท่านั้น',
  pending: 'รอตรวจสิทธิ์',
} as const;

const CONTRACT_LABELS = {
  'hub-v1': 'Hub v1 JSON envelope',
  domain: 'domain response',
  csv: 'CSV file response',
} as const;

export default async function ApiDocsPage({
  searchParams,
}: {
  searchParams: Promise<{ endpoint?: string }>;
}) {
  const { endpoint } = await searchParams;
  const defaultEndpointId = API_ENDPOINTS.find((item) => item.id === endpoint)?.id ?? 'datasets-list';
  return (
    <Shell active="api-docs">
      <div className="page-heading">
        <div>
          <h1>API สำหรับนักพัฒนา</h1>
          <p>
            เลือกดูสัญญาของแต่ละ endpoint แล้วทดลองเรียก API แบบอ่านอย่างเดียวได้จากหน้านี้
            คำตอบสะท้อน runtime และคลังข้อมูลที่หน้าเว็บกำลังใช้อยู่
          </p>
        </div>
      </div>

      <section className={styles.catalogSection} aria-labelledby="api-catalog-title">
        <h2 id="api-catalog-title">รายการ API</h2>
        <p>สิทธิ์และ availability เป็นไปตาม route และ resource ที่เผยแพร่ได้ในขณะเรียกข้อมูล</p>
        {API_GROUPS.map((group) => {
          const endpoints = API_ENDPOINTS.filter((endpoint) => endpoint.group === group.id);
          if (endpoints.length === 0) return null;
          return (
            <section className={styles.catalogGroup} key={group.id} aria-labelledby={`api-group-${group.id}`}>
              <h3 id={`api-group-${group.id}`}>{group.label}</h3>
              <ul className={styles.catalogList}>
                {endpoints.map((endpoint) => (
                  <li key={endpoint.id}>
                    <details className={styles.catalogItem}>
                      <summary>
                        <span className={styles.methodBadge}>{endpoint.method}</span>
                        <code>{endpoint.path}</code>
                        <span className={styles.catalogTitle}>{endpoint.title}</span>
                      </summary>
                      <div className={styles.catalogDetails}>
                        <p>{endpoint.description}</p>
                        <div className={styles.catalogMeta}>
                          <span className={styles.accessBadge}>{ACCESS_LABELS[endpoint.access]}</span>
                          <span className={styles.contractBadge}>{CONTRACT_LABELS[endpoint.contract]}</span>
                          <code>{endpoint.responseType}</code>
                        </div>
                        {((endpoint.pathParams?.length ?? 0) > 0 || (endpoint.query?.length ?? 0) > 0) && (
                          <ul className={styles.catalogQueryList}>
                            {endpoint.pathParams?.map((param) => (
                              <li key={`path-${param.name}`}><code>{param.name}</code> path: {param.description} (เช่น {param.example})</li>
                            ))}
                            {endpoint.query?.map((param) => (
                              <li key={`query-${param.name}`}>
                                <code>{param.name}</code>{param.required ? ' (ต้องระบุ)' : ''}: {param.description}
                                {param.example ? ` ตัวอย่าง ${param.example}` : ''}
                              </li>
                            ))}
                          </ul>
                        )}
                        {endpoint.notes && <ul className={styles.catalogNotes}>{endpoint.notes.map((note) => <li key={note}>{note}</li>)}</ul>}
                        <a className="text-link" href={`/api-docs?endpoint=${encodeURIComponent(endpoint.id)}#playground`}>
                          ทดลอง endpoint นี้
                        </a>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </section>

      <ApiPlayground endpoints={API_ENDPOINTS} groups={API_GROUPS} defaultEndpointId={defaultEndpointId} />
    </Shell>
  );
}
