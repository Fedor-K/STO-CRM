export default function TenantsPage() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Автосервисы</h1>
        <button className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
          Добавить автосервис
        </button>
      </div>
      <p className="mt-4 text-gray-600">Управление тенантами платформы.</p>
    </div>
  );
}
