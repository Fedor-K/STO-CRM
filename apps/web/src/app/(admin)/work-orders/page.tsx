export default function WorkOrdersPage() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Заказ-наряды</h1>
        <button className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
          Создать заказ-наряд
        </button>
      </div>
      <p className="mt-4 text-gray-600">Kanban-доска заказ-нарядов будет здесь.</p>
    </div>
  );
}
