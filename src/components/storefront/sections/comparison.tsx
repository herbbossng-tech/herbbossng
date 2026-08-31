import type { ComparisonData } from '@/types/landing-sections';

export function Comparison({ data }: { data: ComparisonData }) {
  return (
    <section className="bg-cream px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-center text-2xl font-bold text-brand-dark sm:text-3xl">{data.title}</h2>
        <div className="mt-8 overflow-x-auto rounded-xl2 border border-brand-dark/10 bg-white shadow-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-dark/10">
                <th className="p-3 text-left font-medium text-brand-dark/50"> </th>
                {data.columns.map((col) => (
                  <th key={col} className="p-3 text-center font-semibold text-brand-dark">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.label} className="border-b border-brand-dark/5 last:border-0">
                  <td className="p-3 font-medium text-brand-dark">{row.label}</td>
                  {row.values.map((val, i) => (
                    <td key={i} className="p-3 text-center">
                      {typeof val === 'boolean' ? (
                        <span className={val ? 'text-brand' : 'text-brand-dark/20'}>{val ? '✓' : '✕'}</span>
                      ) : (
                        <span className="text-brand-dark/70">{val}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
