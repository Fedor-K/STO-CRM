export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Дашборд</h1>
      <p className="mt-2 text-gray-600">Добро пожаловать в STO-CRM</p>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Заказ-наряды" value="—" subtitle="Активные" />
        <StatCard title="Записи сегодня" value="—" subtitle="На обслуживание" />
        <StatCard title="В работе" value="—" subtitle="Механики заняты" />
        <StatCard title="Выручка за месяц" value="—" subtitle="Текущий период" />
      </div>
    </div>
  );
}

function StatCard({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <p className="text-sm font-medium text-gray-600">{title}</p>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
      <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
    </div>
  );
}
